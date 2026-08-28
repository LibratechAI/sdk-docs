// Contact sheet for review: 4 frames (5/35/65/95 %) per webm under assets/videos/ (or the
// given files) → Screenshots/.tmp/video_frames/<slug>/{1..4}.png + video_frames.md.
//   npm run frames [-- assets/videos/sdk-hero.webm]
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { REPO_ROOT, TMP_DIR } from './paths.ts';
import { FFMPEG_PATH, probeDurationSec } from './storyboard.ts';

const VIDEOS_DIR = join(REPO_ROOT, 'assets/videos'), OUT_DIR = join(TMP_DIR, 'video_frames');
async function* walk(dir: string): AsyncGenerator<string> { for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) { if (e.name.startsWith('.')) continue; const f = join(dir, e.name); if (e.isDirectory()) yield* walk(f); else if (e.name.endsWith('.webm')) yield f; } }
const extract = (video: string, t: number, out: string) => new Promise<void>((res, rej) => { const p = spawn(FFMPEG_PATH, ['-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-q:v', '4', out], { stdio: 'ignore' }); p.on('error', rej); p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))); });

const files = process.argv.slice(2).map((f) => join(REPO_ROOT, f));
if (!files.length) for await (const v of walk(VIDEOS_DIR)) files.push(v);
await rm(OUT_DIR, { recursive: true, force: true }); await mkdir(OUT_DIR, { recursive: true });
let md = `# Video frame samples — ${new Date().toISOString()}\n\n`;
for (const video of files.sort()) {
  const stem = relative(VIDEOS_DIR, video).replace(/\.webm$/, ''), slot = join(OUT_DIR, stem);
  await mkdir(slot, { recursive: true });
  const dur = await probeDurationSec(video);
  const frames: string[] = [];
  for (const [i, p] of [0.05, 0.35, 0.65, 0.95].entries()) { const out = join(slot, `${i + 1}.png`); await extract(video, +(dur * p).toFixed(2), out); frames.push(out); }
  md += `## ${stem} _(${dur.toFixed(1)}s)_\n\n| 5% | 35% | 65% | 95% |\n|---|---|---|---|\n| ${frames.map((f) => `![](${f})`).join(' | ')} |\n\n`;
  console.log(`✓ ${stem} — ${dur.toFixed(1)}s`);
}
await writeFile(join(OUT_DIR, 'video_frames.md'), md);
console.log(`\n${files.length} video(s) · ${join(OUT_DIR, 'video_frames.md')}`);
