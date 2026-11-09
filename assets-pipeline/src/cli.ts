#!/usr/bin/env node
/**
 * CLI for the SDK docs asset pipeline.
 *
 * `auth`     — headed login as the capture account, saves storageState.json.
 *              This is the one manual gate: the playground login may need
 *              MFA, and prod/staging throttle headless Chromium. Run this
 *              locally before each capture session (sessions last about a
 *              day); the daily scanner just queues work, it never logs in
 *              unattended.
 * `capture`  — headless run using the saved storageState, walks the
 *              manifest and writes screenshots for the ids requested.
 *              `--target` picks the playground build: `release` (the pinned
 *              snapshot for the manifest's sdkVersion), `next` (staging head),
 *              or `local` (a sandbox `npm run dev` playground).
 * `list`     — prints manifest ids/outputs.
 * `validate` — confirms every manifest output is referenced by an .mdx page
 *              and every image referenced by an .mdx page exists on disk.
 */
import { Command } from "commander";
import { chromium, type Browser, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import dotenv from "dotenv";
import ffmpegPath from "ffmpeg-static";
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PIPELINE_ROOT, "..");
const MANIFEST_PATH = path.join(PIPELINE_ROOT, "manifest", "components.yaml");
const CAPTURE_LOG_PATH = path.join(PIPELINE_ROOT, "manifest", "captures.json");
const MARKERS_PATH = path.join(PIPELINE_ROOT, "manifest", "markers.json");
const MARKERS_SNIPPET_PATH = path.join(REPO_ROOT, "snippets", "screenshot-markers.jsx");

dotenv.config({ path: path.join(PIPELINE_ROOT, "auth", ".env") });
const BASE_URL = process.env.SDK_PLAYGROUND_URL ?? "https://sdk.staging.libratech.ai";
const LOCAL_URL = process.env.LOCAL_PLAYGROUND_URL ?? "http://localhost:5400";
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
// 460px keeps the "Continue in Libra" label visible in the SDK header.
const DEFAULT_SIDEBAR_WIDTH = 460;
const TOP_BAR = "body > nav";

type CaptureAction = {
  frame?: string;
  clipStart?: boolean;
  click?: string;
  clickPopup?: string;
  clickLast?: string;
  fill?: { selector: string; value: string };
  select?: { selector: string; value: string };
  press?: { selector: string; key: string };
  hover?: string;
  waitFor?: string;
  waitForHidden?: string;
  wait?: number;
  scrollTo?: string;
};

type CaptureAnnotation = {
  selector: string;
  frame?: string;
  at?: "top-left" | "top-right" | "below" | "above" | "left" | "right";
  dx?: number;
  dy?: number;
};

type CaptureComponent = {
  id: string;
  route: string;
  viewport?: { width: number; height: number };
  sidebarWidth?: number;
  video?: boolean;
  actions?: CaptureAction[];
  frame?: string;
  selector?: string;
  annotations?: CaptureAnnotation[];
  sessionUser?: Record<string, unknown>;
  apiOverrides?: Record<string, Record<string, unknown>>;
  apiResponses?: Record<string, unknown>;
  readOnly?: boolean;
  signedOut?: boolean;
  fakeMic?: string;
  playgroundConfig?: Record<string, unknown>;
  output: string;
  page: string;
};

type Manifest = {
  sdkVersion: string;
  sessionUser: Record<string, unknown>;
  apiOverrides: Record<string, Record<string, unknown>>;
  playgroundConfig: Record<string, unknown>;
  components: CaptureComponent[];
};

async function loadManifest(): Promise<Manifest> {
  const parsed = parse(await readFile(MANIFEST_PATH, "utf8")) ?? {};
  return {
    sdkVersion: String(parsed.sdkVersion ?? ""),
    sessionUser: parsed.sessionUser ?? {},
    apiOverrides: parsed.apiOverrides ?? {},
    playgroundConfig: parsed.playgroundConfig ?? {},
    components: (parsed.components ?? []) as CaptureComponent[],
  };
}

type Target = "release" | "next" | "local";

function parseTarget(value: string): Target {
  if (value === "release" || value === "next" || value === "local") return value;
  console.error(`Unknown --target "${value}". Use release, next, or local.`);
  process.exit(1);
}

function targetBaseUrl(target: Target, sdkVersion: string): string {
  if (target === "local") return LOCAL_URL;
  if (target === "next") return BASE_URL;
  if (!/^\d+\.\d+\.\d+$/.test(sdkVersion)) {
    console.error(`manifest/components.yaml needs a valid sdkVersion for --target release (got "${sdkVersion}").`);
    process.exit(1);
  }
  return `${BASE_URL}/versions/v${sdkVersion}`;
}

// Sessions are per origin, so the local playground needs its own login.
const storageStatePath = (target: Target) =>
  path.join(PIPELINE_ROOT, "auth", target === "local" ? "storageState.local.json" : "storageState.json");

type CaptureLogEntry = { output: string; target: Target; url: string; sdkVersion: string; capturedAt: string };

async function readCaptureLog(): Promise<Record<string, CaptureLogEntry>> {
  try {
    return JSON.parse(await readFile(CAPTURE_LOG_PATH, "utf8"));
  } catch {
    return {};
  }
}

const program = new Command();

program
  .command("auth")
  .description("Headed login to the SDK playground as the capture account; saves the session for the target")
  .option("--target <target>", "release, next, or local", "release")
  .action(async (opts) => {
    const target = parseTarget(opts.target);
    const storageState = storageStatePath(target);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${targetBaseUrl(target, (await loadManifest()).sdkVersion)}/playground.html`);
    console.log("Complete login manually in the opened browser window (including any MFA prompt), then return here and press Enter.");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await mkdir(path.dirname(storageState), { recursive: true });
    await context.storageState({ path: storageState });
    await browser.close();
    console.log(`Saved session to ${storageState}`);
  });

program
  .command("list")
  .description("List manifest component ids and their output paths")
  .action(async () => {
    const { components } = await loadManifest();
    if (!components.length) {
      console.log("No components in manifest/components.yaml yet.");
      return;
    }
    for (const c of components) console.log(`${c.id}\t${c.output}\t(${c.page})`);
  });

program
  .command("capture")
  .description("Capture screenshots for manifest components")
  .option("--ids <ids>", "comma-separated component ids to capture (default: all)")
  .option("--target <target>", "release (pinned sdkVersion snapshot), next (staging head), or local", "release")
  .action(async (opts) => {
    const { sdkVersion, sessionUser, apiOverrides, playgroundConfig, components } = await loadManifest();
    if (!components.length) {
      console.log("No components in manifest/components.yaml — nothing to capture.");
      return;
    }
    const wanted = opts.ids ? new Set(opts.ids.split(",")) : null;
    const targets = wanted ? components.filter((c) => wanted.has(c.id)) : components;
    if (!targets.length) {
      console.error("No matching component ids in manifest.");
      process.exit(1);
    }

    const target = parseTarget(opts.target);
    const baseUrl = targetBaseUrl(target, sdkVersion);
    const storageState = storageStatePath(target);
    try {
      await access(storageState);
    } catch {
      console.error(`No saved session at ${storageState} — run "npm run auth -- --target ${target}" first (headed, manual login gate).`);
      process.exit(1);
    }
    console.log(`Capturing ${targets.length} component(s) from ${baseUrl}`);

    const browser = await chromium.launch({ headless: true });
    const topBar = await measureTopBar(browser, `${baseUrl}${targets[0].route}`);
    const captureLog = await readCaptureLog();

    for (const c of targets) {
      const base = c.viewport ?? DEFAULT_VIEWPORT;
      const viewport = { width: base.width, height: base.height + topBar };
      const videoDir = c.video ? await mkdtemp(path.join(os.tmpdir(), "sdk-capture-")) : undefined;
      // Chromium takes the fake microphone file at launch, so these components get their own browser.
      const micBrowser = c.fakeMic
        ? await chromium.launch({
            headless: true,
            args: [
              "--use-fake-ui-for-media-stream",
              "--use-fake-device-for-media-stream",
              `--use-file-for-fake-audio-capture=${path.join(PIPELINE_ROOT, c.fakeMic)}`,
            ],
          })
        : undefined;
      const context = await (micBrowser ?? browser).newContext({
        storageState: c.signedOut ? undefined : storageState,
        viewport,
        deviceScaleFactor: c.video ? 1 : 2,
        ...(videoDir ? { recordVideo: { dir: videoDir, size: viewport } } : {}),
      });
      await context.addInitScript(hostInitScript(c.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH, !!c.video));
      const config = { ...playgroundConfig, ...c.playgroundConfig };
      if (Object.keys(config).length) {
        // The playground reads its SDK init options from this key on load.
        await context.addInitScript(
          `if (window === window.top) localStorage.setItem("libra-playground-config", ${JSON.stringify(JSON.stringify(config))});`,
        );
      }
      const userOverride = { ...sessionUser, ...c.sessionUser };
      const responseOverrides = { ...apiOverrides, ...c.apiOverrides };
      if (Object.keys(userOverride).length) responseOverrides["/api/v1/auths/"] = userOverride;
      // Only the captured browser sees these values; accounts and teams are unchanged.
      const apiPattern = (apiPath: string) =>
        new RegExp(`${apiPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\/$/, "")}\\/?(\\?.*)?$`);
      for (const [apiPath, fields] of Object.entries(responseOverrides)) {
        await context.route(apiPattern(apiPath), async (route) => {
          if (route.request().method() !== "GET") return route.continue();
          const response = await route.fetch();
          if (!response.ok()) return route.fulfill({ response });
          await route.fulfill({ response, json: deepMerge(await response.json(), fields) });
        });
      }
      for (const [apiPath, json] of Object.entries(c.apiResponses ?? {})) {
        await context.route(apiPattern(apiPath), (route) =>
          route.request().method() === "GET" ? route.fulfill({ json }) : route.continue(),
        );
      }
      if (c.readOnly) {
        // Registered last so it runs first: writes get a fake success and never reach the server.
        await context.route(/\/api\//, (route) => (route.request().method() === "GET" ? route.fallback() : route.fulfill({ json: {} })));
      }
      const seenVersions = new Set<string>();
      context.on("request", (request) => {
        const version = request.headers()["x-libra-sdk-version"];
        if (version) seenVersions.add(version);
      });

      const recordingStarted = Date.now();
      let clipStart: number | undefined;
      const page = await context.newPage();
      const url = `${baseUrl}${c.route}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator("iframe").first().waitFor({ state: "attached", timeout: 30000 });
      let scope: Page | FrameLocator = page;
      let popup: Page | undefined;
      try {
        for (const action of c.actions ?? []) {
          if (action.frame) scope = action.frame === "page" ? page : action.frame === "popup" ? popup! : page.frameLocator(action.frame);
          if (action.clipStart) clipStart = Date.now();
          else if (action.clickPopup) {
            [popup] = await Promise.all([context.waitForEvent("page"), scope.locator(action.clickPopup).first().click()]);
            // The SDK opens about:blank first and navigates once the sign-in request is ready.
            await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 60000 });
            await popup.waitForLoadState("networkidle", { timeout: 60000 });
          }
          else if (action.click) await pointAndClick(page, scope.locator(action.click).first(), !!c.video);
          else if (action.clickLast) await pointAndClick(page, scope.locator(action.clickLast).last(), !!c.video);
          else if (action.fill) await scope.locator(action.fill.selector).fill(action.fill.value);
          else if (action.select) await scope.locator(action.select.selector).first().selectOption(action.select.value);
          else if (action.press) await scope.locator(action.press.selector).first().press(action.press.key);
          else if (action.hover) await pointAndClick(page, scope.locator(action.hover).first(), !!c.video, false);
          else if (action.waitFor) await scope.locator(action.waitFor).first().waitFor({ state: "visible", timeout: 60000 });
          else if (action.waitForHidden) await scope.locator(action.waitForHidden).first().waitFor({ state: "hidden", timeout: 60000 });
          else if (action.wait) await page.waitForTimeout(action.wait);
          else if (action.scrollTo) await scope.locator(action.scrollTo).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        }
      } catch (error) {
        const failurePath = path.join(os.tmpdir(), `sdk-capture-failure-${c.id}.png`);
        await page.screenshot({ path: failurePath }).catch(() => {});
        console.error(`Capture ${c.id} failed; page state saved to ${failurePath}`);
        const signedOut = await page.frameLocator("iframe").first().getByRole("button", { name: "Sign in" }).isVisible().catch(() => false);
        if (signedOut) console.error(`The saved session has expired. Run "npm run auth -- --target ${target}" and capture again.`);
        throw error;
      }
      // Signed-out pages make no API calls, so the release-pinned URL is the only version evidence.
      const observed = [...seenVersions].sort().join(", ") || (c.signedOut && target === "release" ? sdkVersion : "");
      if (target === "release" && observed !== sdkVersion) {
        await context.close();
        throw new Error(`Capture ${c.id} ran SDK "${observed || "unknown"}", expected ${sdkVersion}; existing asset left untouched.`);
      }
      const outputPath = path.join(REPO_ROOT, c.output);
      await mkdir(path.dirname(outputPath), { recursive: true });

      if (c.video) {
        const video = page.video();
        await context.close();
        const offset = ((clipStart ?? recordingStarted) - recordingStarted) / 1000;
        await execFileAsync(ffmpegPath as unknown as string, [
          "-y", "-ss", offset.toFixed(2), "-i", await video!.path(),
          "-vf", `crop=${base.width}:${base.height}:0:${topBar}`,
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow",
          "-movflags", "+faststart", "-an", outputPath,
        ]);
        await rm(videoDir!, { recursive: true, force: true });
      } else if (c.frame === "popup") {
        // Popups (such as the Libra sign-in window) are captured whole or by element.
        if (!popup) throw new Error(`Capture ${c.id} uses frame: popup but no clickPopup action opened one.`);
        if (c.selector === "viewport") await popup.screenshot({ path: outputPath });
        else await popup.locator(c.selector ?? "body").first().screenshot({ path: outputPath });
        await context.close();
      } else {
        const region = c.selector === "viewport"
          ? { x: 0, y: topBar, width: base.width, height: base.height }
          : await (c.frame ? page.frameLocator(c.frame) : page).locator(c.selector ?? "body").first().boundingBox();
        if (c.annotations?.length) await saveMarkers(c.id, await measureMarkers(page, c, region!));
        if (c.selector === "viewport") {
          await page.screenshot({ path: outputPath, clip: { x: 0, y: topBar, width: base.width, height: base.height } });
        } else {
          const screenshotScope = c.frame ? page.frameLocator(c.frame) : page;
          await screenshotScope.locator(c.selector ?? "body").first().screenshot({ path: outputPath });
        }
        await context.close();
      }
      await micBrowser?.close();
      captureLog[c.id] = { output: c.output, target, url, sdkVersion: observed || "unknown", capturedAt: new Date().toISOString() };
      await writeFile(CAPTURE_LOG_PATH, JSON.stringify(captureLog, null, 2) + "\n");
      console.log(`Captured ${c.id} -> ${c.output} (SDK ${observed || "unknown"}, ${target})`);
    }

    await browser.close();
  });

// Kept as a string: tsx-transformed functions can reference helpers that don't exist in the page.
function hostInitScript(sidebarWidth: number, showCursor: boolean): string {
  const cursor = `
    const cursor = document.createElement("div");
    cursor.id = "__capture-cursor";
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.5-3.5 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    cursor.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(720px,480px);transition:transform 700ms ease-in-out;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))";
    document.body.appendChild(cursor);`;
  return `(() => {
    if (window !== window.top) return;
    const addStyle = () => {
      const style = document.createElement("style");
      style.textContent = "#root, #chat { --chat-width: ${sidebarWidth}px !important; }";
      document.head.appendChild(style);
    };
    if (document.head) addStyle();
    else {
      const observer = new MutationObserver(() => {
        if (!document.head) return;
        observer.disconnect();
        addStyle();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
    ${showCursor ? `document.addEventListener("DOMContentLoaded", () => {${cursor}});` : ""}
  })();`;
}

// The playground's "Docs / Changelog / Playground" tab bar is not part of the host UI.
async function measureTopBar(browser: Browser, url: string): Promise<number> {
  const page = await browser.newPage({ viewport: DEFAULT_VIEWPORT });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const box = await page.locator(TOP_BAR).first().boundingBox().catch(() => null);
  await page.close();
  return Math.ceil(box?.height ?? 0);
}

type Box = { x: number; y: number; width: number; height: number };

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
      ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
      : value;
  }
  return merged;
}
type Marker = { n: number; x: number; y: number };

// Marker positions are percentages of the captured image, so pages can overlay numbers at any size.
async function measureMarkers(page: Page, c: CaptureComponent, region: Box): Promise<Marker[]> {
  const markers: Marker[] = [];
  for (const [i, a] of c.annotations!.entries()) {
    const scope = a.frame === "page" ? page : page.frameLocator(a.frame ?? "iframe");
    const box = await scope.locator(a.selector).first().boundingBox();
    if (!box) throw new Error(`Annotation ${i + 1} (${a.selector}) is not visible in ${c.id}.`);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const [baseX, baseY] = {
      "top-left": [box.x + 2, box.y + 2],
      "top-right": [box.x + box.width - 2, box.y + 2],
      below: [centerX, box.y + box.height + 12],
      above: [centerX, box.y - 12],
      left: [box.x - 14, centerY],
      right: [box.x + box.width + 14, centerY],
    }[a.at ?? "top-right"];
    const [x, y] = [baseX + (a.dx ?? 0), baseY + (a.dy ?? 0)];
    markers.push({
      n: i + 1,
      x: +(((x - region.x) / region.width) * 100).toFixed(1),
      y: +(((y - region.y) / region.height) * 100).toFixed(1),
    });
  }
  return markers;
}

async function readMarkers(): Promise<Record<string, Marker[]>> {
  try {
    return JSON.parse(await readFile(MARKERS_PATH, "utf8"));
  } catch {
    return {};
  }
}

// Pages can't import JSON, so the markers are also published as a snippet.
async function saveMarkers(id: string, markers: Marker[]): Promise<void> {
  const all = { ...(await readMarkers()), [id]: markers };
  await writeFile(MARKERS_PATH, JSON.stringify(all, null, 2) + "\n");
  await mkdir(path.dirname(MARKERS_SNIPPET_PATH), { recursive: true });
  await writeFile(
    MARKERS_SNIPPET_PATH,
    `// Generated by "npm run capture" in assets-pipeline. Do not edit.\nexport const screenshotMarkers = ${JSON.stringify(all, null, 2)};\n`,
  );
}

async function pointAndClick(page: Page, target: Locator, showCursor: boolean, click = true): Promise<void> {
  if (showCursor) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) {
      await page.evaluate(([x, y]) => {
        const cursor = document.getElementById("__capture-cursor");
        if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`;
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      await page.waitForTimeout(900);
    }
  }
  if (click) await target.click();
  else await target.hover();
  if (showCursor) await page.waitForTimeout(600);
}

program
  .command("validate")
  .description("Check every manifest output is referenced in the docs and every referenced image exists")
  .action(async () => {
    const { sdkVersion, components } = await loadManifest();
    const mdxFiles = await findMdxFiles(REPO_ROOT);
    // Frozen versions (versions/v<x.y.z>/) keep their own copies, so only latest pages count as references.
    const frozen = (f: string) => path.relative(REPO_ROOT, f).startsWith(`versions${path.sep}`);
    let bodies = "";
    let allBodies = "";
    for (const f of mdxFiles) {
      const text = await readFile(f, "utf8");
      allBodies += text;
      if (!frozen(f)) bodies += text;
    }

    let failures = 0;
    for (const c of components) {
      if (!bodies.includes(c.output.replace(/^\/*/, ""))) {
        console.error(`ORPHANED manifest entry (not referenced in any .mdx): ${c.id} -> ${c.output}`);
        failures++;
      }
    }

    const imgRefs = [...allBodies.matchAll(/(?:src="|\]\()\/?((?:versions\/v\d+\.\d+\.\d+\/)?(?:images|videos)\/[^")\s]+)/g)].map((m) => m[1]);
    for (const ref of new Set(imgRefs)) {
      try {
        await access(path.join(REPO_ROOT, ref));
      } catch {
        console.error(`MISSING image referenced in docs: ${ref}`);
        failures++;
      }
    }

    // Stale captures are warnings: docs may be bumped to a new sdkVersion before recapturing.
    const captureLog = await readCaptureLog();
    const markers = await readMarkers();
    for (const c of components) {
      if (c.annotations?.length && markers[c.id]?.length !== c.annotations.length) {
        console.error(`MISSING markers for ${c.id}: run "npm run capture -- --ids ${c.id}" to measure its ${c.annotations.length} annotations.`);
        failures++;
      }
      const entry = captureLog[c.id];
      if (!entry) console.warn(`UNRECORDED capture (no captures.json entry): ${c.id}`);
      else if (entry.target !== "release" || entry.sdkVersion !== sdkVersion) {
        console.warn(`STALE capture: ${c.id} was captured from ${entry.target} ${entry.sdkVersion}; docs baseline is ${sdkVersion}`);
      }
    }

    if (failures) {
      console.error(`\n${failures} validation failure(s).`);
      process.exit(1);
    }
    console.log("All manifest entries referenced, all referenced images present.");
  });

async function findMdxFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".mdx")) out.push(full);
    }
  }
  await walk(root);
  return out;
}

program.parseAsync();
