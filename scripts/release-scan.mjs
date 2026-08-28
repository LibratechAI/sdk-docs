#!/usr/bin/env node
// What shipped in @libra/sdk since these docs were last synced — the triage step of
// the update pipeline (.claude/skills/sdk-docs-update). Reads the synced version from
// snippets/sdk-version.mdx, pulls CHANGELOG.md (gh api, or --file), lists every newer
// release with its bullets bucketed by the docs page that describes that behaviour,
// and the merged sandbox PRs mentioning the SDK in the window (for detail lookups).
//
//   node scripts/release-scan.mjs                 # since the synced version
//   node scripts/release-scan.mjs --since 0.11.0  # override the baseline
//   node scripts/release-scan.mjs --file <path>   # local CHANGELOG.md
//   node scripts/release-scan.mjs --json          # machine-readable
//
// The bucket map is a heuristic — a human (or the skill's agent) confirms it.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadChangelog, parseChangelog, isVersion, compareVersions, longDate } from './sync-changelog.mjs';

// First match wins. Keep in sync with the page list in docs.json.
const PAGE_MAP = [
  [/content-security|\bcsp\b|x-frame|frame-ancestors|permissions-policy|microphone/i, 'guides/security-headers'],
  [/panel|side ?panel|width|resiz|breakpoint|headbar|mountTarget placement|promotional card|entry point/i, 'guides/panel-and-placement'],
  [/composer|chat input|voice|dictat|answer action|regenerate|export|create email|deep thinking|model tier|chat mode|improve button|stop response/i, 'capabilities/chat'],
  [/tools menu|@ ?mention|add context|chat history|project selector|upload|attach|sharepoint|kleos|ra-?micro/i, 'capabilities/context-and-sources'],
  [/subscription|starter|professional|tier|quota|limit reached|entitlement|feature flag/i, 'capabilities/plans-and-limits'],
  [/\bproxy\b|\bbff\b/i, 'guides/proxy-mode'],
  [/\blocales?\b|setLocale|translation/i, 'guides/locales'],
  [/citation/i, 'guides/citations'],
  [/suggestion|external document|\battachments?\b|availability|\bfab\b/i, 'guides/document-suggestions'],
  [/openChatById|libraChatId|continu(e|ing) (in|from|to) (the )?(sdk|libra)|main libra app|handoff|workspace/i, 'guides/chat-handoff'],
  [/\bauth|sign[- ]?in|sign[- ]?up|sign[- ]?out|\blogin\b|onboarding|popup|session|account|trial|subscription/i, 'guides/authentication'],
  [/research sources?|ResearchSourceId|ProductId|productId|\bproducts?\b|\bslugs?\b|\bsources?\b/i, 'capabilities/products-and-sources'],
  [/\bumd\b|\bcjs\b|\besm\b|es module|bundle|\bcdn\b|artifactory|\bnpm\b/i, 'guides/installation'],
  [/init\(|config|mountTarget|zIndex|attach|detach|destroy|onClose|header|headbar|close button|iframe|splash|loader|error page/i, 'guides/embedding'],
  [/\btypes?\b|\bunion\b|exported/i, 'reference/types'],
];
const bucket = (b) => PAGE_MAP.find(([re]) => re.test(b))?.[1] ?? 'capabilities/overview (UI change — confirm with a screenshot)';
const touchesApi = (b) => /Libra\.\w+\(|`on[A-Z]\w+`|`\w+Id`|config field|param/.test(b);

async function syncedVersion() {
  const src = await readFile(path.join(ROOT, 'snippets/sdk-version.mdx'), 'utf8').catch(() => '');
  return src.match(/sdkVersion = "([^"]+)"/)?.[1] ?? null;
}

function mergedPrs(sinceDate) {
  if (!sinceDate) return [];
  try {
    const out = execFileSync('gh', ['pr', 'list', '--repo', 'LibratechAI/sandbox', '--state', 'merged', '--search', `sdk merged:>=${sinceDate}`, '--limit', '100', '--json', 'number,title,mergedAt,url'], { encoding: 'utf8' });
    return JSON.parse(out).filter((p) => /sdk/i.test(p.title)).sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  } catch (e) { console.error(`(gh pr list failed: ${e.message.split('\n')[0]})`); return []; }
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.includes('--file') ? argv[argv.indexOf('--file') + 1] : null;
  const baseline = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : await syncedVersion();
  if (!baseline) throw new Error('no synced version found (snippets/sdk-version.mdx) — pass --since X.Y.Z or run sync-changelog first');

  const releases = parseChangelog(await loadChangelog(file));
  const shipped = releases.filter((r) => isVersion(r.version)).sort((a, b) => compareVersions(a.version, b.version));
  const fresh = shipped.filter((r) => compareVersions(r.version, baseline) > 0);
  const unreleased = releases.find((r) => !isVersion(r.version))?.bullets ?? [];
  const baselineDate = shipped.find((r) => r.version === baseline)?.date ?? null;
  const prs = mergedPrs(baselineDate);

  const items = fresh.flatMap((r) => r.bullets.map((b) => ({ version: r.version, date: r.date, breaking: /^BREAKING\b/i.test(b), text: b.replace(/^BREAKING:\s*/i, ''), pages: [bucket(b), ...(touchesApi(b) ? ['reference/api'] : [])] })));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ baseline, latest: shipped.at(-1)?.version, releases: fresh, items, unreleased, prs }, null, 2));
    return;
  }

  const P = (s = '') => process.stdout.write(s + '\n');
  P(`# SDK release scan — docs at v${baseline}, SDK at v${shipped.at(-1)?.version}`);
  P();
  if (!fresh.length) { P('Nothing new: the docs are synced with the latest release.'); }
  for (const r of fresh) {
    P(`## v${r.version} — ${longDate(r.date)}${r.bullets.some((b) => /^BREAKING/i.test(b)) ? '  ⚠ BREAKING' : ''}`);
    for (const b of r.bullets) P(`- ${b}`);
    P();
  }
  if (items.length) {
    P('## By docs page');
    const byPage = new Map();
    for (const it of items) for (const pg of it.pages) (byPage.get(pg) ?? byPage.set(pg, []).get(pg)).push(it);
    for (const [pg, list] of [...byPage].sort()) {
      P(`### ${pg}`);
      for (const it of list) P(`- ${it.breaking ? '**BREAKING** ' : ''}${it.text} _(v${it.version})_`);
      P();
    }
  }
  if (unreleased.length) {
    P(`## Unreleased (merged, NOT shipped — do not document yet)`);
    for (const b of unreleased) P(`- ${b}`);
    P();
  }
  if (prs.length) {
    P(`## Merged sandbox PRs mentioning the SDK since ${baselineDate}`);
    for (const p of prs) P(`- #${p.number} ${p.title} — ${p.mergedAt.slice(0, 10)} ${p.url}`);
    P();
  }
  if (fresh.length) P('Next: `node scripts/sync-changelog.mjs`, then update the pages above.');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
