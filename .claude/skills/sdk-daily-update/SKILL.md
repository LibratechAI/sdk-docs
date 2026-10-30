---
name: sdk-daily-update
description: The daily check that keeps the Libra SDK docs site in sync with SDK releases from LibratechAI/sandbox. Detects new sdk-v* release tags since the documented version, updates the affected pages and changelog, snapshots the previous version for the version switcher, queues playground captures, and stops for review. Use when the user says "run the daily SDK docs update", "check for SDK updates", or "what SDK changes shipped today".
---

# Daily SDK docs update

Adapted from `LibratechAI/documentation`'s `weekly-docs-update` skill, but:
- **daily** cadence instead of weekly,
- scans the same `LibratechAI/sandbox` repo but keeps **only SDK-scoped**
  commits (the main docs pipeline explicitly excludes them — this repo is
  their dedicated write-up),
- captures against the **release-pinned SDK playground**
  (`sdk.staging.libratech.ai/versions/v<sdkVersion>/playground-2.html`)
  instead of the main app.

## Mental model

- **A release is an `sdk-v*` tag on `main` in `LibratechAI/sandbox`.** The SDK
  UI ships inside the npm/CDN bundle, so a `packages/sdk` commit on `main`
  reaches integrators only when a release is tagged. Until then it sits under
  **Unreleased** in `packages/sdk/CHANGELOG.md`.
- **The docs describe the version in `sdkVersion`** (`assets-pipeline/manifest/components.yaml`).
  The scan compares it with the newest tag.
- **`sdk.staging.libratech.ai/playground.html` = staging head, not the
  release.** It reports the last released version number but already runs
  unreleased changes. Published docs use `/versions/v<sdkVersion>/`.
- **Edit a page → queue its assets.** If a release changed what a playground
  component looks like or does, its docs screenshot is stale.
- **The changelog is user-facing only.** No internal detail, no security
  implications, no infra/eval/deploy noise — same rules as the main docs repo.
- **Nothing is committed without approval.** Pushing `main` publishes the site.

## Prerequisites

1. **Node.js** and the Mintlify CLI (`npm i -g mint`) on PATH.
2. **A local checkout of `LibratechAI/sandbox`** at `$SANDBOX_PATH` (default
   `./.sandbox-checkout` next to this repo). `git fetch origin` before each run.
3. **`gh` CLI** (optional but recommended) to recover full PR bodies for
   title-only squash commits: `gh auth login`.
4. **Assets pipeline bootstrap** (one-time, see
   [assets-pipeline/README.md](../../../assets-pipeline/README.md)):
   ```bash
   cd assets-pipeline && npm install && npx playwright install chromium
   cp auth/.env.example auth/.env   # staging capture credentials; delete after npm run auth
   ```

## The daily run

### 1. Sync sources
```bash
git -C "$SANDBOX_PATH" fetch origin
```

### 2. Check for a new release
```bash
node scripts/sdk-release-scan.mjs --write-queue
```
The scan compares `sdkVersion` with the newest `sdk-v*` tag on `main`.

- **"No new SDK release since X"**: stop. Nothing is published today. The
  printed **Unreleased** section is for the pre-release track only (see Known
  gaps).
- **New release(s)**: the scan prints each release's section from
  `packages/sdk/CHANGELOG.md`, the released `packages/sdk` commits bucketed by
  docs area (`SCOPE_MAP`), and the pages to review on every release. With
  `--write-queue` it writes `assets-pipeline/.capture-queue.json` for areas
  that need fresh playground captures. Continue on a new docs branch, for
  example `docs/sdk-<version>`. If several releases shipped, document the
  newest; freeze only the version the docs described.

### 3. Confirm what changed for integrators
- Treat the release's `CHANGELOG.md` section as the starting list.
- Check the public contract at the tag:
  ```bash
  git -C "$SANDBOX_PATH" diff sdk-v<old> sdk-v<new> -- packages/sdk/src/index.ts \
    packages/sdk/src/lib/types.ts packages/sdk/src/lib/config.ts packages/sdk/README.md
  ```
- Drop anything internal/infra/eval, a minor fix a user wouldn't notice, or
  security-related. If a change is behind a flag or not confirmed live, leave it
  out and flag it for review.

### 4. Freeze the version the docs described
```bash
node scripts/snapshot-docs-version.mjs <old>
```
This copies the current pages to `versions/v<old>/`, together with the images, videos,
and screenshot markers they use, and adds `<old>` to the version switcher. Then
rename the latest entry in `docs.json` `navigation.versions` to `<new>` (keep
`"tag": "Latest"`).

### 5. Bump version strings
- Set `sdkVersion: <new>` in `assets-pipeline/manifest/components.yaml`.
- Find every mention of the old version in the latest pages and update it:
  ```bash
  grep -rn "<old>" --include='*.mdx' . | grep -v '^./versions/' | grep -v changelog.mdx
  ```
  This covers the npm and CDN examples, locale bundles, the release playground
  link, the API reference version and source revision
  (`git -C "$SANDBOX_PATH" rev-parse sdk-v<new>^{commit}`), and Status and support.

### 6. Update the changelog — `changelog.mdx`
Add one block per release at the top, newest first:
```mdx
<Update label="Release: X.Y.Z" id="release-XYZ">

_D Month YYYY_

**New.**
- …

</Update>
```
Group items as **New**, **Improved**, **Fixed**, **Deprecated**, **Removed**.
Use the release date from `CHANGELOG.md`.

### 7. Update affected pages
- Edit the pages listed for each bucket in the scan. The Capabilities page and
  the Integration guide page for the same feature move together.
- Review the "Review on every release" pages (Welcome, Solution overview,
  Capabilities overview, Libra-native pages, Status and support) for anything
  the release changed.
- New SDK concept: create a page from the existing conventions (frontmatter
  `title` + `description`), register it in `docs.json`, and add it to
  `SCOPE_MAP`.
- Public API changed: regenerate `generated/sdk-api/` (see `HANDOVER.md`) and
  update `reference/overview.mdx`.
- Verify every behavior claim in the release playground
  (`/versions/v<new>/playground.html`).

### 8. Review source-versus-docs discrepancies
- Compare the changed pages with the release declarations, the SDK README at
  the tag, the staging SDK reference, and the release playground.
- Record each observation in
  [specs/source-manifest.md](../../../specs/source-manifest.md): date,
  environment, build or version, browser, and scenario.
- Add a row to [specs/discrepancy-register.md](../../../specs/discrepancy-register.md)
  for every new conflict, with severity, authority, owner, and decision.
- Recheck the Deferred rows; resolve the ones the release answers.

### 9. Captures
For every area in `.capture-queue.json` (see
[assets-pipeline/README.md](../../../assets-pipeline/README.md)):
```bash
cd assets-pipeline
npm run auth           # manual gate: headed login as the capture account (the session lasts about a day)
npm run capture        # headless: captures from /versions/v<sdkVersion>/
npm run validate       # every output referenced; warns about stale captures
npm run compose:hero   # only if sdk-home was recaptured: rebuilds the Welcome image
```
Open and check every new capture. The release target refuses assets from any
other SDK build.

### 10. Verify
```bash
node scripts/check.mjs
mint validate
mint broken-links
node scripts/sdk-release-scan.mjs --check-coverage
(cd assets-pipeline && npm run validate)
(cd assets-pipeline && npm run check:render -- --mobile)   # changed pages; needs mint dev running
git diff --check
```
The first four also run in GitHub Actions on every PR (`.github/workflows/check.yml`).
Open the render report (`assets-pipeline/tmp/render-check/report.md`) and look at
the screenshots of every changed page.

### 11. Stop for review
Summarize the release, the pages changed, the discrepancies recorded, and any
captures still queued. **Don't commit, merge, or push until the owner
approves.** After approval, a typical split is:
- `docs(sdk): document release X.Y.Z` — pages, changelog, version switcher.
- `docs(assets): recapture for X.Y.Z` — regenerated images.
- `docs(specs): record X.Y.Z sources and discrepancies`.

## Known gaps & human gates

- **Auth is a manual gate**, same as the main docs repo — `npm run auth`
  needs a human and possibly MFA. A daily cron can run the *scan* and the
  *docs edit* unattended, but capture only proceeds if a session is still
  valid (currently about a day).
- **Pre-release track** — `node scripts/sdk-release-scan.mjs --branch staging`
  lists `packages/sdk` commits on staging after the newest release tag, with
  the **Unreleased** changelog section. Draft those on a docs branch and
  capture with `npm run capture -- --target next`; never publish them until an
  `sdk-v*` release ships them.
- **Capture account.** For now, captures use a team member's staging account
  with the seeded Demo Project. Screenshots show the user as "John Doe" through
  `sessionUser` in `assets-pipeline/manifest/components.yaml`; the account is
  not changed. A dedicated `sdk-docs-capture` account remains the preferred
  long-term setup. Never commit credentials or saved sessions.
- **Brittle selectors** — any playground UI change can silently break a
  capture. `assets-pipeline/manifest/components.yaml` selectors should
  prefer `[data-testid=…]`.
- **Title-only commits** — use `gh pr view <#> --repo LibratechAI/sandbox`
  to recover detail when the scan flags something for human review.

## See also

- [scripts/sdk-release-scan.mjs](../../../scripts/sdk-release-scan.mjs) — the release scanner.
- [scripts/snapshot-docs-version.mjs](../../../scripts/snapshot-docs-version.mjs) — freezes a version for the switcher.
- [assets-pipeline/README.md](../../../assets-pipeline/README.md) — the capture pipeline reference.
- `LibratechAI/documentation`'s `weekly-docs-update` and `capture-from-worklist`
  skills — the pattern this was adapted from.
