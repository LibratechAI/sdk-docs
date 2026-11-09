// Render check (adapted from the public sdk-docs repo's visual_check.ts): opens pages on a
// running `mint dev` and flags what a reader would notice: an error page, broken images,
// unplayable videos, console errors. Screenshots and a report go to assets-pipeline/tmp/render-check/.
//
//   npm run check:render                          # pages changed vs main (+ uncommitted); mint dev must be running
//   npm run check:render -- --all                 # every page in docs.json, all versions
//   npm run check:render -- --pages integration/lifecycle,index
//   npm run check:render -- --serve --mobile      # start mint dev itself; also check a 390 px viewport
//   MINTLIFY_BASE=http://localhost:3003 npm run check:render
import { chromium, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PIPELINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PIPELINE_ROOT, "..");
const OUT_DIR = path.join(PIPELINE_ROOT, "tmp", "render-check");
let base = process.env.MINTLIFY_BASE ?? "http://localhost:3000";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string) => (flag(name) ? argv[argv.indexOf(name) + 1] : undefined);
const git = (args: string[]) => {
  try {
    return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" });
  } catch {
    return "";
  }
};

function navPages(node: unknown, acc: string[] = []): string[] {
  if (typeof node === "string") acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => navPages(n, acc));
  else if (node && typeof node === "object")
    for (const k of ["pages", "groups", "tabs", "anchors", "versions"]) navPages((node as Record<string, unknown>)[k], acc);
  return acc;
}

async function changedPages(ref: string, all: string[]): Promise<string[]> {
  const files = [git(["diff", "--name-only", ref]), git(["ls-files", "--others", "--exclude-standard"])]
    .join("\n").split("\n").map((s) => s.trim()).filter(Boolean);
  const pages = new Set(files.filter((f) => f.endsWith(".mdx")).map((f) => f.replace(/\.mdx$/, "")).filter((p) => all.includes(p)));
  // A changed image or video affects every page that references it.
  const assets = files.filter((f) => /^(versions\/[^/]+\/)?(images|videos)\//.test(f));
  if (assets.length)
    for (const p of all) {
      const text = await readFile(path.join(REPO_ROOT, `${p}.mdx`), "utf8").catch(() => "");
      if (assets.some((a) => text.includes(`/${a}`))) pages.add(p);
    }
  return [...pages].sort();
}

type Finding = { page: string; viewport: string; issues: string[]; shot: string };

async function checkPage(page: Page, route: string, viewport: string): Promise<Finding> {
  const issues: string[] = [];
  const consoleErrors: string[] = [];
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  const url = route === "index" ? `${base}/` : `${base}/${route}`;
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 }).catch((e: Error) => {
    issues.push(`navigation failed: ${e.message.split("\n")[0]}`);
    return null;
  });
  if (response && response.status() >= 400) issues.push(`HTTP ${response.status()}`);
  await page.waitForTimeout(800);
  const brokenImages = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((i) => { const s = i.getAttribute("src") || ""; return s && !s.startsWith("data:") && (!i.complete || i.naturalWidth === 0); })
      .map((i) => i.getAttribute("src") || ""),
  );
  for (const s of brokenImages) issues.push(`broken image: ${s}`);
  const badVideos = await page.evaluate(async () => {
    const out: string[] = [];
    for (const v of [...document.querySelectorAll("video")]) {
      const src = v.getAttribute("src") || v.querySelector("source")?.getAttribute("src") || "";
      if (!src) { out.push("video with no src"); continue; }
      await v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      if (v.videoWidth === 0 || v.readyState < 2) out.push(`unplayable video: ${src}`);
    }
    return out;
  });
  issues.push(...badVideos);
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console error(s): ${consoleErrors[0].slice(0, 140)}`);
  const shot = path.join(OUT_DIR, `${route.replace(/\//g, "_")}-${viewport}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  return { page: route, viewport, issues, shot };
}

async function waitForServer(ms = 120_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`mint dev did not answer on ${base} within ${ms / 1000}s`);
}

const docs = JSON.parse(await readFile(path.join(REPO_ROOT, "docs.json"), "utf8"));
const allPages = [...new Set(navPages(docs.navigation))];
const pages = flag("--all") ? allPages : option("--pages")?.split(",").map((p) => p.trim().replace(/\.mdx$/, "")) ?? (await changedPages(option("--base") ?? "main", allPages));
if (!pages.length) {
  console.log("No changed pages.");
  process.exit(0);
}

let server: ChildProcess | null = null;
if (flag("--serve")) {
  // mint dev moves to another port when 3000 is busy, so follow the URL it prints.
  server = spawn("mint", ["dev"], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
  await new Promise<void>((resolve) => {
    const sniff = (chunk: Buffer) => {
      const m = String(chunk).match(/https?:\/\/localhost:\d+/);
      if (m) { if (!process.env.MINTLIFY_BASE) base = m[0]; resolve(); }
    };
    server!.stdout?.on("data", sniff);
    server!.stderr?.on("data", sniff);
    setTimeout(resolve, 120_000);
  });
}

try {
  await waitForServer();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const viewports = [{ name: "desktop", width: 1280, height: 900 }, ...(flag("--mobile") ? [{ name: "mobile", width: 390, height: 844 }] : [])];
  const browser = await chromium.launch();
  const findings: Finding[] = [];
  for (const vp of viewports) {
    const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
    for (const p of pages) {
      const f = await checkPage(page, p, vp.name);
      findings.push(f);
      console.log(`${f.issues.length ? "FAIL" : "ok  "} ${vp.name.padEnd(7)} ${p}${f.issues.map((i) => `\n       ${i}`).join("")}`);
    }
  }
  await browser.close();
  const bad = findings.filter((f) => f.issues.length);
  const report = findings.map((f) => `## ${f.issues.length ? "FAIL" : "ok"} ${f.page} (${f.viewport})\n${f.issues.map((i) => `- ${i}`).join("\n")}\n\n![](${f.shot})\n`).join("\n");
  await writeFile(path.join(OUT_DIR, "report.md"), `# Render check, ${new Date().toISOString()}\n\n${findings.length} checks, ${bad.length} with issues.\n\n${report}`);
  console.log(`\n${findings.length - bad.length}/${findings.length} ok. Report: ${path.join(OUT_DIR, "report.md")}`);
  process.exitCode = bad.length ? 1 : 0;
} finally {
  // Kill the whole group: mint dev's children keep the port open and would serve stale navigation.
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); } }
}
