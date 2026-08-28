// Visual QA gate: render changed pages on a local `mint dev` and flag what a reader would
// notice — 404/error page, broken <img>, unplayable <video>, console errors. Full-page
// screenshots + a markdown report land in Screenshots/.tmp/visual_check/.
//
//   npm run check                       # pages changed vs origin/main (+ uncommitted), needs mint dev running
//   npm run check:serve                 # starts/stops `mint dev` itself
//   npm run check -- --all | --pages guides/embedding.mdx,index.mdx | --base origin/HEAD
import { chromium, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, TMP_DIR, mdxFiles } from './paths.ts';

let MINTLIFY_BASE = process.env.MINTLIFY_BASE ?? 'http://localhost:3000';
const OUT_DIR = join(TMP_DIR, 'visual_check');
const git = (args: string[]) => { try { return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' }); } catch { return ''; } };

async function changedPages(base: string): Promise<string[]> {
  const lines = [...git(['diff', '--name-only', base]).split('\n'), ...git(['diff', '--name-only']).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')].map((s) => s.trim()).filter(Boolean);
  const pages = new Set(lines.filter((p) => p.endsWith('.mdx') && !p.startsWith('snippets/') && !p.startsWith('Screenshots/')));
  const assets = lines.filter((p) => p.startsWith('assets/'));
  if (assets.length) for (const p of await mdxFiles()) { const t = await readFile(join(REPO_ROOT, p), 'utf8'); if (assets.some((a) => t.includes(`/${a}`))) pages.add(p); }
  return [...pages].sort();
}

const pageToUrl = (mdx: string) => mdx === 'index.mdx' ? `${MINTLIFY_BASE}/` : `${MINTLIFY_BASE}/${mdx.replace(/\.mdx$/, '')}`;
interface Finding { page: string; ok: boolean; issues: string[]; shot: string }

async function checkPage(page: Page, mdx: string): Promise<Finding> {
  const issues: string[] = [], consoleErrors: string[] = [];
  page.removeAllListeners('console'); page.removeAllListeners('pageerror');
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  const resp = await page.goto(pageToUrl(mdx), { waitUntil: 'networkidle', timeout: 45_000 }).catch((e) => { issues.push(`navigation failed: ${(e as Error).message}`); return null; });
  if (resp && resp.status() >= 400) issues.push(`HTTP ${resp.status()}`);
  await page.waitForTimeout(800);
  if (await page.locator('img[alt*="cannot balance" i], img[class*="error-404"]').count().catch(() => 0)) issues.push('renders the 404 / error page');
  for (const s of await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => { const s = i.getAttribute('src') || ''; return s && !s.startsWith('data:') && (!i.complete || i.naturalWidth === 0); }).map((i) => i.getAttribute('src') || ''))) issues.push(`broken image: ${s}`);
  for (const s of await page.evaluate(async () => {
    const out: string[] = [];
    for (const v of [...document.querySelectorAll('video')]) {
      const src = v.getAttribute('src') || v.querySelector('source')?.getAttribute('src') || '';
      if (!src) { out.push('(video with no src)'); continue; }
      await v.play().catch(() => {}); await new Promise((r) => setTimeout(r, 300));
      if (v.videoWidth === 0 || v.readyState < 2) out.push(`unplayable video: ${src}`);
    }
    return out;
  })) issues.push(s);
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console error(s): ${consoleErrors[0].slice(0, 120)}`);
  const shot = join(OUT_DIR, `${mdx.replace(/\.mdx$/, '').replace(/\//g, '_')}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  return { page: mdx, ok: issues.length === 0, issues, shot };
}

async function waitForServer(ms = 120_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await fetch(MINTLIFY_BASE)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
  throw new Error(`mint dev did not answer on ${MINTLIFY_BASE} within ${ms / 1000}s`);
}

const argv = process.argv.slice(2);
const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'origin/main';
const pages = argv.includes('--all') ? await mdxFiles() : argv.includes('--pages') ? argv[argv.indexOf('--pages') + 1].split(',') : await changedPages(base);
if (!pages.length) { console.log('No changed pages.'); process.exit(0); }
let server: ChildProcess | null = null;
let portKnown: Promise<void> = Promise.resolve();
if (argv.includes('--serve')) {
  // mint dev moves to another port when 3000 is busy — follow whatever it prints.
  server = spawn('mint', ['dev'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let ready!: () => void; portKnown = process.env.MINTLIFY_BASE ? Promise.resolve() : new Promise<void>((r) => (ready = r));
  const sniff = (c: Buffer) => { const m = String(c).match(/https?:\/\/localhost:\d+/); if (m) { if (!process.env.MINTLIFY_BASE) MINTLIFY_BASE = m[0]; ready?.(); } };
  server.stdout?.on('data', sniff); server.stderr?.on('data', sniff);
}
try {
  await Promise.race([portKnown, new Promise((r) => setTimeout(r, 120_000))]);
  await waitForServer();
  await rm(OUT_DIR, { recursive: true, force: true }); await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const findings: Finding[] = [];
  for (const p of pages) { const f = await checkPage(page, p); findings.push(f); console.log(`${f.ok ? '✓' : '✗'} ${p}${f.issues.length ? '\n    ' + f.issues.join('\n    ') : ''}`); }
  await browser.close();
  const bad = findings.filter((f) => !f.ok);
  await writeFile(join(OUT_DIR, 'report.md'), `# Visual check — ${new Date().toISOString()}\n\n${findings.length} page(s), ${bad.length} with issues.\n\n${findings.map((f) => `## ${f.ok ? '✓' : '✗'} ${f.page}\n${f.issues.map((i) => `- ${i}`).join('\n')}\n\n![](${f.shot})\n`).join('\n')}`);
  console.log(`\n${findings.length - bad.length}/${findings.length} ok · report ${join(OUT_DIR, 'report.md')}`);
  process.exitCode = bad.length ? 1 : 0;
} finally {
  // Kill the whole process group: `mint dev` spawns children that keep the port open
  // (a leftover server serves a STALE docs.json navigation and silently invalidates a run).
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } }
}
