// The SDK renders inside a blob: iframe on the host page. Manifest selectors
// resolve INSIDE that iframe by default; prefix with `host:` to target the host
// page itself (playground controls, the iframe element, overlays).
import type { Page, Locator } from '@playwright/test';

export const SDK_FRAME = process.env.SDK_FRAME ?? '[data-libra-sdk] iframe';

export function resolve(page: Page, selector: string): Locator {
  if (selector.startsWith('host:')) return page.locator(selector.slice(5).trim()).first();
  return page.frameLocator(SDK_FRAME).locator(selector).first();
}
