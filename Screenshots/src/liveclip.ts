// Live mode: a short real recording on the playground. Selectors resolve inside the SDK
// iframe by default (`host:` prefix for the page). Every step asserts — a missing target
// THROWS, so a broken step fails the render instead of producing a wrong-content video.
import { chromium, type Locator, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolve } from './frame.ts';
import { OVERLAY_CSS, OVERLAY_JS } from './overlay.ts';
import { BASE_URL, REPO_ROOT, STORAGE_STATE, TMP_DIR } from './paths.ts';
import { waitForSdk } from './runner.ts';
import { type LiveScene, type LiveStep, type Viewport, DEFAULT_VIEWPORT, finalize, probeDurationSec } from './storyboard.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cursorTo(page: Page, loc: Locator, vp: Viewport): Promise<void> {
  const box = await loc.boundingBox(); // main-frame coordinates, also for elements inside the SDK iframe
  if (!box) throw new Error('target has no bounding box (not visible)');
  await page.evaluate(([x, y]) => (window as any).__ov.cursorTo(x, y, 600), [(box.x + box.width / 2) / vp.width, (box.y + box.height / 2) / vp.height]);
  await sleep(650);
}

async function runStep(page: Page, step: LiveStep, vp: Viewport): Promise<void> {
  if (step.caption !== undefined) await page.evaluate((t) => (window as any).__ov.caption(t), step.caption);
  const visible = async (sel: string) => { const l = resolve(page, sel); await l.waitFor({ state: 'visible', timeout: step.timeout ?? 15_000 }); return l; };
  if (step.wait_for) await visible(step.wait_for);
  else if (step.wait_ms) await sleep(step.wait_ms);
  else if (step.click) { const l = await visible(step.click); await cursorTo(page, l, vp); await page.evaluate(() => (window as any).__ov.clickPulse()); await l.click({ timeout: 8_000 }); }
  else if (step.hover) { const l = await visible(step.hover); await cursorTo(page, l, vp); await l.hover({ timeout: 6_000 }); }
  else if (step.fill) { const l = await visible(step.fill.selector); await cursorTo(page, l, vp); await l.fill(step.fill.text, { timeout: 8_000 }); }
  else if (step.press) { const l = await visible(step.press.selector); await l.press(step.press.key, { timeout: 8_000 }); }
  if (step.expect) await visible(step.expect);
  await sleep(step.dwell_ms ?? 700);
}

export async function recordLive(scene: LiveScene): Promise<void> {
  if (scene.auth && !existsSync(STORAGE_STATE)) throw new Error(`[${scene.id}] needs auth/storageState.json — run \`npm run auth\``);
  const outAbs = join(REPO_ROOT, scene.output);
  await mkdir(dirname(outAbs), { recursive: true });
  const tmp = join(TMP_DIR, 'video', scene.id);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const vp = scene.viewport ?? DEFAULT_VIEWPORT;
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...(scene.auth ? { storageState: STORAGE_STATE } : {}), viewport: vp, recordVideo: { dir: tmp, size: vp } });
  await context.addInitScript(OVERLAY_JS);
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(scene.url.startsWith('http') ? scene.url : `${BASE_URL}${scene.url}`, { waitUntil: 'domcontentloaded' });
  await waitForSdk(page);
  await resolve(page, scene.ready).waitFor({ state: 'visible', timeout: 30_000 });
  const readyMs = Date.now() - t0; // trim marker: the recording starts when the SDK is ready, never on the splash
  await page.addStyleTag({ content: OVERLAY_CSS });
  await sleep(400);
  for (const step of scene.steps) await runStep(page, step, vp);
  await resolve(page, scene.expect).waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => (window as any).__ov.hideCaption());
  await sleep(900);
  await context.close();
  await browser.close();
  const raw = (await readdir(tmp)).find((f) => f.endsWith('.webm'));
  if (!raw) throw new Error(`[${scene.id}] no video produced`);
  const rawPath = join(tmp, raw);
  const keepSec = scene.trim_end_ms !== undefined ? Math.max(0.1, (await probeDurationSec(rawPath)) - readyMs / 1000 - scene.trim_end_ms / 1000) : undefined;
  await finalize(rawPath, outAbs, { trimStartMs: readyMs, keepSec, speed: scene.playback_speed ?? 1 });
  await rm(tmp, { recursive: true, force: true });
  console.log(`✓ live [${scene.id}] → ${scene.output} (trimmed ${readyMs} ms lead)`);
}
