# Libra SDK documentation

Internal Mintlify site documenting the [Libra SDK](https://sdk.staging.libratech.ai) (`@libra/sdk`) for Wolters Kluwer product teams: integration guides and code snippets for engineers, capabilities and screenshots for product and marketing.

## Local preview

```bash
npm i -g mint      # Mintlify CLI (Node 22)
mint dev           # http://localhost:3000
```

## Layout

- `index.mdx`, `getting-started/`, `guides/`, `capabilities/`, `reference/` — authored pages.
- `changelog.mdx`, `snippets/sdk-version.mdx` — **generated** from `packages/sdk/CHANGELOG.md` in `LibratechAI/sandbox` by `scripts/sync-changelog.mjs`. Don't edit by hand.
- `assets/images/sdk/`, `assets/videos/` — screenshots and videos, produced by the `Screenshots/` capture harness.
- `scripts/` — `check.mjs` (structural gate), `sync-changelog.mjs`, `release-scan.mjs` (what shipped since the last sync).
- `Screenshots/` — Playwright harness: `npm run auth`, `npm run capture`, `npm run render`, `npm run check`. See its README.

## Updating for a release

```bash
node scripts/release-scan.mjs        # new versions + bullets, bucketed by docs page
node scripts/sync-changelog.mjs      # regenerate changelog + version snippet
# edit the affected pages, then:
cd Screenshots && npm run capture -- --all && npm run render -- --all
node scripts/check.mjs
```

The full procedure is in `.claude/skills/sdk-docs-update/SKILL.md`. Pushing to `main` deploys via the Mintlify GitHub app.
