#!/usr/bin/env node
// Structural check, offline (adapted from the public sdk-docs repo):
//   - docs.json parses; every navigation entry has a page, and every page is in the navigation
//   - every page has a title and description
//   - every internal link, image, and video on a page resolves
//   - every redirect points to a page and doesn't shadow one
//   - no home-folder paths in published pages
//   - version-switcher.js matches the versions in docs.json
// Exit 1 on errors.

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SWITCHER_FILE, switcherSource } from "./version-switcher.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Not reader pages: tooling, internal notes, and asset folders (see .mintignore).
const SKIP_DIRS = new Set([
  ".git", ".github", ".claude", "node_modules", "assets-pipeline", "scripts", "snippets",
  "specs", "references", "generated", "drafts", "images", "videos", "fonts", "logo",
]);
const errors = [], warnings = [];

async function mdxFiles(dir = ROOT, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await mdxFiles(path.join(dir, e.name), acc); }
    else if (e.name.endsWith(".mdx")) acc.push(path.relative(ROOT, path.join(dir, e.name)));
  }
  return acc;
}

function navPages(node, acc = []) {
  if (typeof node === "string") acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => navPages(n, acc));
  else if (node && typeof node === "object") for (const k of ["pages", "groups", "tabs", "anchors", "dropdowns", "versions", "languages"]) if (node[k]) navPages(node[k], acc);
  return acc;
}

let docs;
try { docs = JSON.parse(await readFile(path.join(ROOT, "docs.json"), "utf8")); }
catch (e) { console.error(`docs.json: ${e.message}`); process.exit(1); }

const nav = navPages(docs.navigation);
const pages = (await mdxFiles()).map((p) => p.replace(/\.mdx$/, "")).sort();
for (const n of nav) if (!pages.includes(n)) errors.push(`nav entry "${n}" has no ${n}.mdx`);
for (const p of pages) if (!nav.includes(p)) warnings.push(`${p}.mdx is not in docs.json navigation (still served by URL)`);

const pageExists = (route) => route === "/" || pages.includes(route.replace(/^\//, "").replace(/\/$/, ""));
const ASSET = /\.(png|jpe?g|gif|svg|webp|webm|mp4|woff2?)$/i;

for (const p of pages) {
  const file = `${p}.mdx`;
  const text = await readFile(path.join(ROOT, file), "utf8");
  if (!/^---\n(?:[\s\S]*?\n)?title:/m.test(text)) errors.push(`${file}: missing frontmatter title`);
  if (!/^---\n(?:[\s\S]*?\n)?description:/m.test(text)) errors.push(`${file}: missing frontmatter description`);
  if (/\/Users\/[^/\s]+|\/home\/[^/\s]+\//.test(text)) errors.push(`${file}: contains a home-folder path`);
  const refs = [
    ...text.matchAll(/(?:href|src)=["'](\/[^"'#?\s]+)/g),
    ...text.matchAll(/\]\((\/[^)#?\s]+)\)/g),
  ].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    if (ASSET.test(ref)) { if (!existsSync(path.join(ROOT, ref))) errors.push(`${file}: missing file ${ref}`); }
    else if (!pageExists(ref)) errors.push(`${file}: broken internal link ${ref}`);
  }
  // A `<lowercase` tag in prose that isn't HTML usually means unescaped JSX.
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^---[\s\S]*?---/, "");
  for (const m of prose.matchAll(/<([a-z][\w-]*)\b/g)) if (!/^(img|video|source|br|kbd|a|b|i|em|strong|code|sup|sub|div|span|p|ul|ol|li|table|thead|tbody|tr|th|td|details|summary|iframe)$/.test(m[1])) warnings.push(`${file}: bare "<${m[1]}" outside code`);
}

for (const r of docs.redirects ?? []) {
  if (!pageExists(r.destination)) errors.push(`redirect ${r.source} -> ${r.destination}: destination is not a page`);
  if (pageExists(r.source)) errors.push(`redirect ${r.source}: source is an existing page, so the redirect hides it`);
}

try {
  if ((await readFile(SWITCHER_FILE, "utf8").catch(() => "")) !== switcherSource(docs)) errors.push("version-switcher.js is out of date; run node scripts/version-switcher.mjs");
} catch (e) { errors.push(e.message); }

// CI installs from the public registry; locally npm maps registry.npmjs.org to the configured mirror.
for (const lock of ["package-lock.json", "assets-pipeline/package-lock.json"]) {
  if (!existsSync(path.join(ROOT, lock))) continue;
  const hosts = new Set([...(await readFile(path.join(ROOT, lock), "utf8")).matchAll(/"resolved": "(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
  for (const h of hosts) if (h !== "https://registry.npmjs.org") errors.push(`${lock}: resolves packages from ${h}; rewrite to https://registry.npmjs.org`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${pages.length} pages, ${nav.length} nav entries, ${(docs.redirects ?? []).length} redirects, ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
