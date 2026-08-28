// Headed login on the playground — the one manual gate. The SDK keeps its token in
// the host origin's localStorage (namespaced `libra:`), so Playwright's storageState
// captures it. Done when the playground's #sdk-auth-state reports "authenticated"
// (or, as a fallback, when the user closes the window).
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function ensureStorageState(path: string): void {
  if (!existsSync(path)) throw new Error(`storageState not found at ${path}\nRun \`npm run auth\` (interactive login on the playground).`);
}

export async function refreshAuth(url: string, storageStatePath: string): Promise<void> {
  console.log(`Opening ${url}\nSign in through the widget's Auth0 popup as the screenshot account.`);
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const authed = page.locator('#sdk-auth-state', { hasText: /"status":"authenticated"/ }).waitFor({ timeout: 0 }).then(() => 'authenticated' as const);
  const closed = page.waitForEvent('close', { timeout: 0 }).then(() => 'closed' as const);
  const how = await Promise.race([authed, closed]).catch(() => 'closed' as const);
  if (how === 'authenticated') await page.waitForTimeout(1500);
  await mkdir(dirname(storageStatePath), { recursive: true });
  try {
    await ctx.storageState({ path: storageStatePath });
    console.log(`Saved ${storageStatePath} (${how})`);
  } catch (e) {
    console.error(`Could not save storageState (${how}): ${(e as Error).message}\nLeave the window open until the status line shows "authenticated" — the script closes it itself.`);
    process.exitCode = 1;
  }
  await browser.close().catch(() => {});
}
