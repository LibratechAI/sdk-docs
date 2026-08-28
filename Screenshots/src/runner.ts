import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { runActions } from './actions.ts';
import { captureClip, captureLocator, capturePage } from './capture.ts';
import { SDK_FRAME } from './frame.ts';
import { BASE_URL, MANIFEST, REPO_ROOT, STORAGE_STATE } from './paths.ts';
import type { RunRecord, ShotSpec } from './types.ts';

export async function loadManifest(path = MANIFEST): Promise<ShotSpec[]> {
  const parsed = YAML.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${path}: manifest must be a YAML list of shot specs`);
  const seen = new Set<string>();
  for (const s of parsed) {
    for (const f of ['id', 'output', 'viewport', 'url'] as const) if (s[f] == null) throw new Error(`${path}: shot ${s.id ?? '?'} is missing "${f}"`);
    if (typeof s.viewport.width !== 'number' || typeof s.viewport.height !== 'number') throw new Error(`${path}: shot ${s.id}: viewport.width/height must be numbers`);
    if (seen.has(s.id)) throw new Error(`duplicate shot id: ${s.id}`);
    seen.add(s.id);
  }
  return parsed as ShotSpec[];
}

/** The SDK iframe exists, its splash is gone and the app root has content; then settle. */
export async function waitForSdk(page: Page): Promise<void> {
  await page.locator(SDK_FRAME).waitFor({ state: 'attached', timeout: 30_000 });
  const frame = page.frameLocator(SDK_FRAME);
  await frame.locator('#libra-sdk-splash:not(.fade-out)').waitFor({ state: 'hidden', timeout: 45_000 }).catch(() => {});
  await frame.locator('#libra-sdk-root *').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(Number(process.env.CAPTURE_SETTLE_MS) || 1500);
}

export async function runCaptures(shots: ShotSpec[], opts: { headed: boolean }): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  const hasAuth = existsSync(STORAGE_STATE);
  const browser = await chromium.launch({ headless: !opts.headed });
  // One context per auth flag: anonymous shots (the auth screen) must not see the session.
  const contexts = new Map<boolean, { ctx: BrowserContext; page: Page }>();
  const pageFor = async (auth: boolean) => {
    if (!contexts.has(auth)) {
      const ctx = await browser.newContext({ colorScheme: 'light', deviceScaleFactor: 2, ...(auth ? { storageState: STORAGE_STATE } : {}) });
      contexts.set(auth, { ctx, page: await ctx.newPage() });
    }
    return contexts.get(auth)!.page;
  };
  let prev = { ok: false, auth: false };
  try {
    for (const spec of shots) {
      const started = Date.now();
      const auth = !!spec.auth;
      try {
        if (auth && !hasAuth) {
          records.push({ id: spec.id, output: spec.output, status: 'skipped', durationMs: 0, error: 'needs auth/storageState.json — run `npm run auth`' });
          console.log(`- [${spec.id}] skipped (needs auth)`);
          prev = { ok: false, auth };
          continue;
        }
        if (spec.chain && (!prev.ok || prev.auth !== auth)) throw new Error('chain: true needs the previous shot to have succeeded with the same auth flag');
        const page = await pageFor(auth);
        await page.setViewportSize(spec.viewport);
        if (!spec.chain) {
          await page.goto(spec.url.startsWith('http') ? spec.url : `${BASE_URL}${spec.url}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await waitForSdk(page);
        }
        await runActions(page, spec.actions ?? [], BASE_URL);
        const outPath = join(REPO_ROOT, spec.output);
        const mode = spec.capture?.mode ?? 'page';
        let bytes: number;
        if (mode === 'page') bytes = await capturePage(page, spec, outPath);
        else if (mode === 'locator') bytes = await captureLocator(page, spec, outPath);
        else if (mode === 'clip') bytes = await captureClip(page, spec, outPath);
        else throw new Error(`unknown capture mode: ${mode}`);
        records.push({ id: spec.id, output: spec.output, status: 'ok', durationMs: Date.now() - started, bytes });
        console.log(`✓ [${spec.id}] ${spec.output} (${bytes} B, ${Date.now() - started} ms)`);
        prev = { ok: true, auth };
      } catch (err: any) {
        records.push({ id: spec.id, output: spec.output, status: 'failed', durationMs: Date.now() - started, error: err?.message ?? String(err) });
        console.error(`✗ [${spec.id}] ${spec.output}: ${err?.message ?? err}`);
        prev = { ok: false, auth };
      }
    }
  } finally {
    await browser.close();
  }
  return records;
}
