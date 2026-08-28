import type { Page } from '@playwright/test';
import { resolve } from './frame.ts';
import type { Action } from './types.ts';

export async function runActions(page: Page, actions: Action[], baseUrl: string): Promise<void> {
  for (const action of actions) {
    if ('wait_for' in action) {
      await resolve(page, action.wait_for).waitFor({ timeout: action.timeout ?? 15_000 });
    } else if ('wait_for_url' in action) {
      const expected = action.wait_for_url.startsWith('http') ? action.wait_for_url : `${baseUrl}${action.wait_for_url}`;
      await page.waitForURL(expected, { timeout: action.timeout ?? 15_000 });
    } else if ('wait_timeout' in action) {
      await page.waitForTimeout(action.wait_timeout);
    } else if ('goto' in action) {
      const url = action.goto.startsWith('http') ? action.goto : `${baseUrl}${action.goto}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    } else if ('click' in action) {
      await resolve(page, action.click).click(action.force ? { force: true } : undefined);
    } else if ('hover' in action) {
      await resolve(page, action.hover).hover();
    } else if ('fill' in action) {
      await resolve(page, action.fill).fill(action.text);
    } else if ('press' in action) {
      await resolve(page, action.press).press(action.key);
    } else if ('scroll' in action) {
      const target = resolve(page, action.scroll);
      if (action.to === 'top') await target.evaluate((el) => el.scrollTo({ top: 0 }));
      else await target.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    } else if ('select' in action) {
      await resolve(page, action.select).selectOption(action.option);
    } else if ('set_files' in action) {
      await resolve(page, action.set_files).setInputFiles(action.files);
    } else {
      const _exhaustive: never = action;
      throw new Error(`Unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
