#!/usr/bin/env node
// Structural gate, run before every PR:
//   - docs.json parses; every navigation entry has a page file
//   - every page file is in the navigation (unlinked pages are still served)
//   - every internal link / image / video / font on a page resolves to a file or page
//   - lists `{/* TODO screenshot: <id> */}` markers = the capture worklist
// Exit 1 on errors. Pure filesystem — no network.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'Screenshots', 'scripts', 'snippets', '.git', '.claude', 'assets', 'fonts']);
const errors = [], warnings = [], todos = [];

async function mdxFiles(dir = ROOT, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await mdxFiles(path.join(dir, e.name), acc); }
    else if (e.name.endsWith('.mdx')) acc.push(path.relative(ROOT, path.join(dir, e.name)));
  }
  return acc;
}

function navPages(node, acc = []) {
  if (typeof node === 'string') acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => navPages(n, acc));
  else if (node && typeof node === 'object') for (const k of ['pages', 'groups', 'tabs', 'anchors', 'dropdowns', 'versions', 'languages']) if (node[k]) navPages(node[k], acc);
  return acc;
}

let docs;
try { docs = JSON.parse(await readFile(path.join(ROOT, 'docs.json'), 'utf8')); }
catch (e) { console.error(`docs.json: ${e.message}`); process.exit(1); }

const nav = navPages(docs.navigation);
const pages = (await mdxFiles()).map((p) => p.replace(/\.mdx$/, '')).sort();
for (const n of nav) if (!pages.includes(n)) errors.push(`nav entry "${n}" has no ${n}.mdx`);
for (const p of pages) if (!nav.includes(p)) warnings.push(`${p}.mdx is not in docs.json navigation (still served by URL)`);

const pageExists = (route) => route === '/' || existsSync(path.join(ROOT, `${route.replace(/^\//, '')}.mdx`)) || existsSync(path.join(ROOT, route.replace(/^\//, ''), 'index.mdx'));
for (const p of pages) {
  const file = `${p}.mdx`;
  const text = await readFile(path.join(ROOT, file), 'utf8');
  if (!/^---\n(?:[\s\S]*?\n)?title:/m.test(text)) errors.push(`${file}: missing frontmatter title`);
  if (!/^---\n(?:[\s\S]*?\n)?description:/m.test(text)) warnings.push(`${file}: missing frontmatter description`);
  const refs = [...text.matchAll(/(?:href|src)=["'](\/[^"'#?\s]+)/g), ...text.matchAll(/\]\((\/[^)#?\s]+)\)/g)].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    if (/^\/(assets|fonts)\/|\.(png|jpg|jpeg|svg|webm|mp4|woff2?)$/.test(ref)) { if (!existsSync(path.join(ROOT, ref))) errors.push(`${file}: missing file ${ref}`); }
    else if (!pageExists(ref)) errors.push(`${file}: broken internal link ${ref}`);
  }
  for (const m of text.matchAll(/\{\/\*\s*TODO (screenshot|video):\s*([^*]+?)\s*\*\/\}/g)) todos.push({ file, kind: m[1], id: m[2] });
  // JSX hazards outside code: a `{` or `<letter` in prose that isn't a component/comment.
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^---[\s\S]*?---/, '');
  for (const m of prose.matchAll(/<([a-z][\w-]*)\b/g)) if (!/^(img|video|source|br|kbd|a|b|i|em|strong|code|sup|sub|div|span|p|ul|ol|li|table|thead|tbody|tr|th|td|details|summary|iframe)$/.test(m[1])) warnings.push(`${file}: bare "<${m[1]}" outside code — JSX?`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
if (todos.length) { console.log(`\nCapture worklist (${todos.length} TODO marker(s)):`); for (const t of todos) console.log(`  ${t.kind.padEnd(10)} ${t.id.padEnd(26)} ← ${t.file}`); }
console.log(`\n${pages.length} pages, ${nav.length} nav entries, ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
