// npm run auth | capture | list | validate  (see ../README.md)
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refreshAuth } from './auth.ts';
import { BASE_URL, REPO_ROOT, SCREENSHOTS_DIR, STORAGE_STATE, mdxFiles } from './paths.ts';
import { loadManifest, runCaptures } from './runner.ts';
import type { ShotSpec } from './types.ts';

const select = (all: ShotSpec[], o: { id?: string; ids?: string; filter?: string; all?: boolean }) =>
  o.id ? all.filter((s) => s.id === o.id)
  : o.ids ? all.filter((s) => o.ids!.split(',').map((x) => x.trim()).includes(s.id))
  : o.filter ? all.filter((s) => s.output.includes(o.filter!))
  : o.all ? all : [];

const program = new Command().name('screenshots').description('Libra SDK docs screenshot pipeline (staging playground)');

program.command('capture')
  .option('--id <id>').option('--ids <ids>', 'comma-separated').option('--filter <substring>', 'match on output path').option('--all')
  .option('--dry-run', 'print the selection, no browser').option('--headed', 'watch the browser')
  .action(async (o) => {
    const shots = select(await loadManifest(), o);
    if (!shots.length) { console.error('No shots selected. Use --id, --ids, --filter or --all.'); process.exit(1); }
    if (o.dryRun) { for (const s of shots) console.log(`${s.id}\t${s.auth ? 'auth' : 'anon'}\t${s.output}\t${s.url}`); return; }
    const records = await runCaptures(shots, { headed: !!o.headed });
    await writeFile(join(SCREENSHOTS_DIR, 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), baseUrl: BASE_URL, records }, null, 2));
    const ok = records.filter((r) => r.status === 'ok').length, skipped = records.filter((r) => r.status === 'skipped').length;
    console.log(`\n${ok}/${records.length} ok${skipped ? `, ${skipped} skipped (no auth)` : ''}`);
    if (records.some((r) => r.status === 'failed')) process.exit(1);
  });

program.command('list').description('print the manifest').action(async () => {
  const all = await loadManifest();
  for (const s of all) console.log(`${s.id}\t${s.auth ? 'auth' : 'anon'}\t${s.output}\t${s.page ?? ''}`);
  console.log(`\n${all.length} shots`);
});

program.command('validate').description('every manifest output is referenced by a page (as <img src> or a TODO screenshot marker), and every `page:` exists').action(async () => {
  const all = await loadManifest();
  const pages = new Map<string, string>();
  for (const p of await mdxFiles()) pages.set(p, await readFile(join(REPO_ROOT, p), 'utf8'));
  const problems: string[] = [];
  for (const s of all) {
    const referenced = [...pages.values()].some((t) => t.includes(`/${s.output}`) || new RegExp(`TODO screenshot:\\s*${s.id}\\b`).test(t));
    if (!referenced) problems.push(`${s.id}: ${s.output} is not referenced by any page (add <img src="/${s.output}"> or {/* TODO screenshot: ${s.id} */})`);
    if (s.page && !pages.has(s.page)) problems.push(`${s.id}: page "${s.page}" does not exist`);
  }
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`OK — ${all.length} shots, all referenced.`);
});

program.command('auth').description('headed login on the playground → auth/storageState.json').action(() => refreshAuth(`${BASE_URL}/playground.html`, STORAGE_STATE));

program.parseAsync(process.argv).catch((e) => { console.error(e); process.exit(1); });
