#!/usr/bin/env node
// Builds the one-page versions in the version switcher: every SDK release
// before FIRST_FULL_VERSION gets versions/v<version>/index.mdx with the SDK
// README at that release, the same page the SDK staging site shows at
// /versions/v<version>/index.html. Full documentation starts at FIRST_FULL_VERSION.
//   SANDBOX_PATH=/path/to/sandbox node scripts/build-legacy-versions.mjs
// Reruns replace the one-page versions in docs.json and leave full versions alone.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSwitcher } from "./version-switcher.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_JSON = path.join(REPO_ROOT, "docs.json");
const SANDBOX = process.env.SANDBOX_PATH || path.join(REPO_ROOT, ".sandbox-checkout");
const STAGING = "https://sdk.staging.libratech.ai";
// The staging site's version list starts at 0.7.0.
const FIRST_LEGACY_VERSION = "0.7.0";
const FIRST_FULL_VERSION = "0.16.0";

const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

const git = (...args) => execFileSync("git", ["-C", SANDBOX, ...args], { encoding: "utf8", maxBuffer: 1 << 24 });

const versions = git("tag", "--list", "sdk-v*")
  .split("\n")
  .map((t) => t.trim().replace(/^sdk-v/, ""))
  .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && cmp(v, FIRST_LEGACY_VERSION) >= 0 && cmp(v, FIRST_FULL_VERSION) < 0)
  .sort((a, b) => cmp(b, a));

// MDX reads `<` and `{` in prose as JSX; code spans and fenced blocks are literal.
function escapeProse(text) {
  return text
    .replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/</g, "&lt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

function escapeLine(line) {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(/(`+)[^`]*?\1/g)) {
    out += escapeProse(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + escapeProse(line.slice(last));
}

function readmeToMdx(readme) {
  const lines = readme.replace(/\r\n/g, "\n").split("\n");
  const firstH1 = lines.findIndex((l) => /^# /.test(l));
  if (firstH1 !== -1) lines.splice(firstH1, 1);
  let fence = null;
  return lines
    .map((line) => {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
        return line.trimEnd();
      }
      if (f) {
        fence = f[1];
        return line;
      }
      return escapeLine(line);
    })
    .join("\n")
    .trim();
}

function page(version, readme) {
  const site = `${STAGING}/versions/v${version}`;
  return `---
title: "Libra SDK ${version}"
sidebarTitle: "SDK ${version}"
description: "The @libra/sdk ${version} README, as the SDK staging site publishes it."
---

<Note>
Full documentation starts with SDK ${FIRST_FULL_VERSION}. For ${version}, this page shows the SDK README as the [SDK staging site](${site}/index.html) publishes it. To try this release, use its [playground](${site}/playground.html).
</Note>

${readmeToMdx(readme)}
`;
}

const docs = JSON.parse(await readFile(DOCS_JSON, "utf8"));
const nav = docs.navigation;
const latest = nav.versions[0];
const latestAnchors = latest.global?.anchors ?? [];
const anchorsFor = (version) =>
  latestAnchors.map((a) => {
    if (a.anchor === "Playground") return { ...a, href: `${STAGING}/versions/v${version}/playground.html` };
    if (a.anchor === "Changelog") return { ...a, href: `${STAGING}/versions/v${version}/changelog.html` };
    return a;
  });

const entries = [];
for (const version of versions) {
  const readme = git("show", `sdk-v${version}:packages/sdk/README.md`);
  const file = path.join(REPO_ROOT, "versions", `v${version}`, "index.mdx");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, page(version, readme));
  entries.push({
    version,
    global: { anchors: anchorsFor(version) },
    groups: [{ group: "Libra SDK", icon: "house", pages: [`versions/v${version}/index`] }],
  });
}

const full = nav.versions.filter((v) => cmp(v.version, FIRST_FULL_VERSION) >= 0);
nav.versions = [...full, ...entries];
await writeFile(DOCS_JSON, `${JSON.stringify(docs, null, 2)}\n`);
await writeSwitcher(docs);
console.log(`Wrote ${entries.length} one-page version(s): ${versions.join(", ")}.`);
