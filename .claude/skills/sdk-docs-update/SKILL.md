---
name: sdk-docs-update
description: Release-driven update of the Libra SDK docs. Scans what shipped in @libra/sdk (LibratechAI/sandbox packages/sdk) since the docs' synced version, regenerates the changelog, updates the affected pages from the SDK README, refreshes the screenshots/videos those pages use, runs the structural and visual gates, and opens a PR. Use when the user says "update the SDK docs", "what shipped in the SDK", "sync the SDK changelog", or a new SDK version is out.
---

# SDK docs update

One pass per release (or batch of releases): **scan → sync changelog → update pages → capture/render assets → check → PR.** Everything derives from `LibratechAI/sandbox` `packages/sdk/` (`README.md` = API contract, `CHANGELOG.md` = what shipped). Read [CLAUDE.md](../../../CLAUDE.md) first for the source-of-truth and page conventions.

## Prerequisites

- `gh auth status` OK (the sandbox is private). Node 22 on PATH (`/opt/homebrew/opt/node@22/bin`).
- `Screenshots/node_modules` installed and `npx playwright install chromium` done (see [Screenshots/README.md](../../../Screenshots/README.md)).
- For `auth: true` captures: a fresh `Screenshots/auth/storageState.json` — `cd Screenshots && npm run auth`. **This is the only manual gate**; skip it when no page needs new authenticated shots.

## Steps

### 1. Scan
```bash
git checkout main && git pull
node scripts/release-scan.mjs            # releases newer than snippets/sdk-version.mdx, bullets bucketed by page, merged SDK PRs
```
`Nothing new` → stop. Otherwise note every version, every **BREAKING** bullet, and the **Unreleased** block (merged, not shipped: never document it).

### 1b. Never document a claim you have not checked against the code

The SDK README and the WK product decks both go stale. On 2026-08-27 a 13-topic verification pass over the "SDK v2" deck returned 74 findings: only 11 CONFIRMED, 13 outright OUTDATED, 47 partly wrong. Things that would have shipped as fact: a `622px` breakpoint that exists nowhere in the codebase, Deep Thinking described as a paid-tier feature (it is not gated at all), and a chat-mode selector that is now a combined tier+model control.

So, for any claim sourced from a deck, a ticket, a Slack message, or the README rather than from code you just read:

- Verify it against `LibratechAI/sandbox` `main` before it reaches a page. `gh api "repos/LibratechAI/sandbox/git/trees/main?recursive=1" --jq '.tree[].path'` then read the files.
- Separate **SDK-package behaviour** (`packages/sdk/`) from **main-app behaviour rendered inside the iframe** (`src/`). They have different release cycles and the distinction changes what an integrator can rely on.
- Treat flag-gated or entitlement-gated behaviour as **not general**. If it sits behind a feature flag, a per-team grant, or an env var, either say so explicitly or leave it out.
- Never publish: internal flag names, M2M credentials, unreleased work, or the ops mechanics behind a restriction.
- Attribute design guidance that is not in the code as guidance ("Wolters Kluwer design guidance, not enforced by the SDK").

For a batch of claims this is worth fanning out — one agent per topic, each returning `{claim, verdict, evidence, corrected, docsRelevance}`, with a second agent adversarially re-checking every CONFIRMED/OUTDATED verdict. The adversarial pass is what caught the flag-gating and the SDK-vs-app confusions above.

### 2. Diff the contract
The changelog says *what* changed; the README says *how it now works*. Pull the README changes in the window and read them:
```bash
gh api "repos/LibratechAI/sandbox/commits?path=packages/sdk/README.md&since=<baseline release date>T00:00:00Z" --jq '.[].sha' \
  | xargs -I{} gh api repos/LibratechAI/sandbox/commits/{} --jq '.files[] | select(.filename=="packages/sdk/README.md") | .patch'
```
For bullets the scan could not bucket, `gh pr view <#> --repo LibratechAI/sandbox` on the listed PRs.

### 3. Sync the changelog
```bash
git checkout -b docs/sdk-v<latest>
node scripts/sync-changelog.mjs          # rewrites changelog.mdx + snippets/sdk-version.mdx
git add changelog.mdx snippets && git commit -m "changelog: sync to v<latest>"
```

### 4. Update pages
For each `## By docs page` bucket from step 1:
- **README text or snippet changed** → update the page; code that exists in the README is copied verbatim, not paraphrased. `grep -rn "<old name>" --include=*.mdx .` to catch every occurrence of a renamed option/slug/type.
- **New `init()` option or `Libra.*` method** → `reference/api.mdx` (table/section) + the guide that owns the behaviour + `reference/types.mdx` if a type changed.
- **New product/source/locale** → `capabilities/products-and-sources.mdx` or `guides/locales.mdx`, and the type unions in `reference/types.mdx`.
- **BREAKING** → make sure the migration is stated on the affected page (old → new) in addition to the tagged changelog entry.
- **Pure UI change** (no API) → `capabilities/overview.mdx` prose if a user would notice; otherwise changelog only.
- **New page** → add it to `docs.json` navigation and to `PAGE_MAP` in `scripts/release-scan.mjs`.

Internal-only detail (SPEC.md internals, M2M credentials, roadmap, security specifics) never goes in. Keep content commits separate from asset commits.

### 5. Assets for changed pages
For every page edited in step 4, list its images/videos and its TODO markers:
```bash
grep -oE '(src="/assets/[^"]+"|TODO (screenshot|video): [a-z0-9-]+)' <page>.mdx
```
- **Existing shot whose UI changed** → `cd Screenshots && npm run capture -- --id <id>`; fix selectors in `manifest/shots.yaml` if the playground moved (prefer ids/roles/text; `host:` for host-page controls).
- **New shot** → add a manifest entry (unique `id`, `output: assets/images/sdk/<subject>-<state>.png`, `page:`), put `{/* TODO screenshot: <id> */}` where the image goes, capture, then replace the marker with `<img src="/assets/images/sdk/…" alt="…" />`.
- **Videos** → `npm run render -- --id <scene>` (composed from stills by default); replace `{/* TODO video: <id> */}` with the `<video …>` tag from CLAUDE.md once the file exists.
- **Eyeball every new PNG/frame** (`npm run frames` for videos). A wrong selector produces a wrong picture, not an error. No splash, no spinner, no empty state.
```bash
npm run validate && npm run render:verify
git add assets Screenshots/manifest && git commit -m "assets: v<latest> screenshots/videos"
```

### 6. Gates
```bash
node scripts/check.mjs                        # nav ↔ files, links, assets, remaining TODO worklist
node scripts/sync-changelog.mjs --check       # generated files are current
cd Screenshots && npm run check:serve         # every changed page renders: no 404, broken image, unplayable video, console error
```
Fix, don't skip. Remaining `TODO screenshot/video` markers are allowed on a PR only if listed in the PR body as follow-up work.

### 7. PR
```bash
git push -u origin docs/sdk-v<latest>
gh pr create --title "docs: SDK v<latest>" --body "<versions covered · pages touched · BREAKING migrations stated · assets refreshed · open TODO markers>"
```
Mintlify deploys `main` on merge.

## Automating it
This skill is designed to run unattended except for step 5's authenticated captures. A scheduled routine (Claude Code `/schedule`, weekly) can run steps 1–4, 6, 7 and leave the capture worklist (the `TODO` markers `check.mjs` prints) for a local run of step 5, the same handoff the documentation repo uses.
