#!/usr/bin/env node
// Freezes the current (latest) docs as a version in the version switcher.
//
// Run it right before the docs move to a new SDK release:
//   node scripts/snapshot-docs-version.mjs 0.15.1
// It copies every page of the latest version in docs.json to versions/v<version>/,
// points internal links in the copies at that folder, and adds the version
// to the switcher. Then bump the latest version's label in docs.json.
// Images, videos, and screenshot markers the pages use are copied into the same
// folder, so later recaptures can't change a frozen version. To freeze the
// assets of an existing snapshot:
//   node scripts/snapshot-docs-version.mjs 0.15.0 --assets-only

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_JSON = path.join(REPO_ROOT, "docs.json");
const MARKERS = "snippets/screenshot-markers.jsx";

const version = process.argv[2];
const assetsOnly = process.argv.includes("--assets-only");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node scripts/snapshot-docs-version.mjs <x.y.z> [--assets-only]");
  process.exit(1);
}
const prefix = `versions/v${version}`;

// Root-absolute image and video paths in src attributes and markdown images.
const ASSET = /(["'(])\/((?:images|videos)\/[^"')\s]+)/g;

async function freezeAssets(file) {
  let text = await readFile(file, "utf8");
  const assets = new Set([...text.matchAll(ASSET)].map((m) => m[2]));
  for (const asset of assets) {
    const dest = path.join(REPO_ROOT, prefix, asset);
    if (existsSync(dest)) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(REPO_ROOT, asset), dest);
  }
  text = text.replace(ASSET, (_, lead, asset) => `${lead}/${prefix}/${asset}`);
  if (text.includes(`/${MARKERS}`)) {
    const frozenMarkers = `${prefix}/snippets/screenshot-markers.jsx`;
    if (!existsSync(path.join(REPO_ROOT, frozenMarkers))) {
      await mkdir(path.join(REPO_ROOT, path.dirname(frozenMarkers)), { recursive: true });
      await copyFile(path.join(REPO_ROOT, MARKERS), path.join(REPO_ROOT, frozenMarkers));
    }
    text = text.replaceAll(`/${MARKERS}`, `/${frozenMarkers}`);
  }
  await writeFile(file, text);
  return assets.size;
}

async function mdxFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await mdxFiles(full)));
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

if (assetsOnly) {
  if (!existsSync(path.join(REPO_ROOT, prefix))) {
    console.error(`${prefix}/ doesn't exist.`);
    process.exit(1);
  }
  let refs = 0;
  for (const file of await mdxFiles(path.join(REPO_ROOT, prefix))) refs += await freezeAssets(file);
  console.log(`Froze ${refs} asset reference(s) in ${prefix}/.`);
  process.exit(0);
}

const docs = JSON.parse(await readFile(DOCS_JSON, "utf8"));
const versions = docs.navigation?.versions;
if (!Array.isArray(versions) || !versions.length) {
  console.error("docs.json has no navigation.versions.");
  process.exit(1);
}
if (versions.some((v) => v.version === version)) {
  console.error(`Version ${version} is already in docs.json.`);
  process.exit(1);
}
if (existsSync(path.join(REPO_ROOT, prefix))) {
  console.error(`${prefix}/ already exists.`);
  process.exit(1);
}

const latest = versions[0];
const pages = [];
const collect = (items) => items.forEach((p) => (typeof p === "string" ? pages.push(p) : collect(p.pages ?? [])));
latest.groups.forEach((g) => collect(g.pages ?? []));
const pageSet = new Set(pages);

// Matches markdown links, JSX href attributes, and href keys in JS objects.
const LINK = /(\]\(|href=\{?["']|href:\s*["'])\/([a-z0-9\-/]*)(?=[#)"'\s])/g;
const rewrite = (text) =>
  text.replace(LINK, (match, lead, target) => {
    if (target === "") return `${lead}/${prefix}`;
    return pageSet.has(target) ? `${lead}/${prefix}/${target}` : match;
  });

for (const page of pages) {
  const source = ["mdx", "md"].map((ext) => path.join(REPO_ROOT, `${page}.${ext}`)).find(existsSync);
  if (!source) {
    console.error(`Missing page file for ${page}`);
    process.exit(1);
  }
  const dest = path.join(REPO_ROOT, prefix, path.relative(REPO_ROOT, source));
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, rewrite(await readFile(source, "utf8")));
  await freezeAssets(dest);
}

const prefixGroups = (items) =>
  items.map((p) => (typeof p === "string" ? `${prefix}/${p}` : { ...p, pages: prefixGroups(p.pages ?? []) }));
const snapshot = {
  version,
  groups: latest.groups.map((g) => ({ ...g, pages: prefixGroups(g.pages ?? []) })),
};

// Keep the switcher newest first; the latest version stays on top.
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
const at = versions.findIndex((v, i) => i > 0 && newer(v.version, version) < 0);
versions.splice(at === -1 ? versions.length : at, 0, snapshot);

await writeFile(DOCS_JSON, `${JSON.stringify(docs, null, 2)}\n`);
console.log(`Copied ${pages.length} pages to ${prefix}/ and added ${version} to the version switcher.`);
