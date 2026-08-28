// npm run render -- --id <scene> | --ids a,b | --all      npm run render:verify
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { recordComposed } from './compose.ts';
import { recordLive } from './liveclip.ts';
import { REPO_ROOT } from './paths.ts';
import { loadStoryboards, probeDurationSec, selectScenes, type Scene } from './storyboard.ts';

async function verify(scenes: Scene[]): Promise<number> {
  let bad = 0;
  for (const s of scenes) {
    try {
      const { size } = await stat(join(REPO_ROOT, s.output));
      const dur = await probeDurationSec(join(REPO_ROOT, s.output));
      const ok = size > 10_000 && dur >= 1.5 && dur <= 40;
      console.log(`${ok ? '✓' : '✗'} ${s.id}  ${s.output}  ${(size / 1024).toFixed(0)}KB  ${dur.toFixed(1)}s`);
      if (!ok) bad++;
    } catch { console.log(`✗ ${s.id}  MISSING  ${s.output}`); bad++; }
  }
  return bad;
}

const argv = process.argv.slice(2);
const scenes = selectScenes(await loadStoryboards(), argv.includes('--verify') && !argv.some((a) => a.startsWith('--id') || a === '--all') ? ['--all'] : argv);
if (!scenes.length) { console.error('No matching scenes. Use --id <scene> | --ids a,b | --all (add --verify to only check outputs).'); process.exit(2); }
if (argv.includes('--verify')) { const bad = await verify(scenes); console.log(`\n${scenes.length - bad}/${scenes.length} ok`); process.exit(bad ? 1 : 0); }
let ok = 0;
for (const scene of scenes) {
  try {
    if (scene.mode === 'composed') await recordComposed(scene);
    else if (scene.mode === 'live') await recordLive(scene);
    else throw new Error(`unknown mode: ${(scene as Scene).mode}`);
    ok++;
  } catch (err) { console.error(`✗ [${scene.id}] ${(err as Error).message}`); }
}
console.log(`\n${ok}/${scenes.length} rendered`);
if (ok < scenes.length) process.exit(1);
