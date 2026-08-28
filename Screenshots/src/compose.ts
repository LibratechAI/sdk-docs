// Composed mode: a walkthrough video from already-captured stills. An HTML stage stacks
// the stills; an in-page timeline crossfades, zooms to focus, glides the cursor and shows
// captions; Playwright records it; ffmpeg re-encodes to VP9.
import { chromium } from '@playwright/test';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OVERLAY_CSS, OVERLAY_JS } from './overlay.ts';
import { REPO_ROOT, TMP_DIR } from './paths.ts';
import { type ComposedScene, DEFAULT_VIEWPORT, finalize, inlineImage } from './storyboard.ts';

function stageHtml(beats: ComposedScene['beats'], dataUrls: string[]): string {
  const timeline = beats.map((b, i) => ({ i, caption: b.caption ?? '', cursor_to: b.cursor_to ?? null, focus: b.focus ?? null, move_ms: b.move_ms ?? 650, dwell_ms: b.dwell_ms ?? 1400 }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#1a1a1a;overflow:hidden;width:100vw;height:100vh}
    .frame{position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;opacity:0;transition:opacity .4s ease;will-change:opacity,transform}
    ${OVERLAY_CSS}</style></head><body>
    ${dataUrls.map((src, i) => `<img class="frame" data-i="${i}" src="${src}" />`).join('\n')}
    <script>${OVERLAY_JS}</script>
    <script>
      const B = ${JSON.stringify(timeline)}, EASE = 'cubic-bezier(.22,.61,.36,1)';
      const frames = [...document.querySelectorAll('.frame')], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        await sleep(250);
        for (const b of B) {
          frames.forEach((f, j) => (f.style.opacity = j === b.i ? '1' : '0'));
          const f = frames[b.i];
          if (b.focus) {
            const [cx, cy, sc] = b.focus;
            f.style.transformOrigin = (cx * 100) + '% ' + (cy * 100) + '%';
            f.animate([{ transform: f.style.transform || 'scale(1)' }, { transform: 'scale(' + sc + ')' }], { duration: b.move_ms, easing: EASE, fill: 'forwards' });
            f.style.transform = 'scale(' + sc + ')';
          } else f.style.transform = 'scale(1)';
          window.__ov.caption(b.caption);
          if (b.cursor_to) await window.__ov.cursorTo(b.cursor_to[0], b.cursor_to[1], b.move_ms); else await sleep(Math.min(b.move_ms, 400));
          await sleep(b.dwell_ms);
        }
        window.__ov.hideCaption(); await sleep(450); window.__done = true;
      })();
    </script></body></html>`;
}

export async function recordComposed(scene: ComposedScene): Promise<void> {
  if (!scene.beats?.length) throw new Error(`[${scene.id}] composed scene has no beats`);
  const outAbs = join(REPO_ROOT, scene.output);
  await mkdir(dirname(outAbs), { recursive: true });
  const tmp = join(TMP_DIR, 'video', scene.id);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const html = stageHtml(scene.beats, await Promise.all(scene.beats.map((b) => inlineImage(b.image))));
  const viewport = scene.viewport ?? DEFAULT_VIEWPORT;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, recordVideo: { dir: tmp, size: viewport } });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const totalMs = scene.beats.reduce((n, b) => n + (b.move_ms ?? 650) + (b.dwell_ms ?? 1400), 0) + 2000;
  await page.waitForFunction('window.__done === true', { timeout: totalMs + 10_000 });
  await context.close();
  await browser.close();
  const raw = (await readdir(tmp)).find((f) => f.endsWith('.webm'));
  if (!raw) throw new Error(`[${scene.id}] no video produced`);
  await finalize(join(tmp, raw), outAbs, { trimStartMs: 200 });
  await rm(tmp, { recursive: true, force: true });
  console.log(`✓ composed [${scene.id}] → ${scene.output}`);
}
