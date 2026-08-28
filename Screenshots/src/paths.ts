// Shared locations + env for the harness. auth/.env (gitignored) overrides.
import { config as loadEnv } from 'dotenv';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCREENSHOTS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO_ROOT = dirname(SCREENSHOTS_DIR);
loadEnv({ path: join(SCREENSHOTS_DIR, 'auth/.env') });

export const BASE_URL = (process.env.SDK_BASE_URL ?? 'https://sdk.staging.libratech.ai').replace(/\/$/, '');
export const STORAGE_STATE = process.env.SDK_STORAGE_STATE
  ? resolve(SCREENSHOTS_DIR, process.env.SDK_STORAGE_STATE)
  : join(SCREENSHOTS_DIR, 'auth/storageState.json');
export const MANIFEST = join(SCREENSHOTS_DIR, 'manifest/shots.yaml');
export const STORYBOARDS = join(SCREENSHOTS_DIR, 'manifest/storyboards.yaml');
export const TMP_DIR = join(SCREENSHOTS_DIR, '.tmp');

const SKIP = new Set(['node_modules', 'Screenshots', 'scripts', 'snippets', '.git', '.claude', 'assets', 'fonts']);

/** Every docs page, repo-relative (`guides/embedding.mdx`). */
export async function mdxFiles(dir = REPO_ROOT, acc: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) await mdxFiles(join(dir, e.name), acc); }
    else if (e.name.endsWith('.mdx')) acc.push(relative(REPO_ROOT, join(dir, e.name)));
  }
  return acc.sort();
}
