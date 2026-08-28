import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolve } from './frame.ts';
import type { ShotSpec } from './types.ts';

const ensureDir = (filePath: string) => mkdir(dirname(filePath), { recursive: true });

export async function capturePage(page: Page, spec: ShotSpec, outPath: string): Promise<number> {
  await ensureDir(outPath);
  const buffer = await page.screenshot({ fullPage: spec.capture?.full_page ?? false, type: 'png' });
  await writeFile(outPath, buffer);
  return buffer.length;
}

export async function captureLocator(page: Page, spec: ShotSpec, outPath: string): Promise<number> {
  if (!spec.capture?.locator) throw new Error(`[${spec.id}] capture.locator is required for mode=locator`);
  await ensureDir(outPath);
  const target = resolve(page, spec.capture.locator);
  await target.waitFor({ state: 'visible' });
  const raw = await target.screenshot({ type: 'png' });
  const padding = spec.capture.padding ?? 0;
  if (padding === 0) { await writeFile(outPath, raw); return raw.length; }
  const meta = await sharp(raw).metadata();
  const padded = await sharp({
    create: { width: (meta.width ?? 0) + padding * 2, height: (meta.height ?? 0) + padding * 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).composite([{ input: raw, top: padding, left: padding }]).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(outPath, padded);
  return padded.length;
}

export async function captureClip(page: Page, spec: ShotSpec, outPath: string): Promise<number> {
  if (!spec.capture?.clip) throw new Error(`[${spec.id}] capture.clip is required for mode=clip`);
  await ensureDir(outPath);
  const buffer = await page.screenshot({ clip: spec.capture.clip, type: 'png' });
  await writeFile(outPath, buffer);
  return buffer.length;
}
