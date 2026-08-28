# CLAUDE.md

Mintlify docs site for the **Libra SDK** (`@libra/sdk`) — the embeddable chat widget Wolters Kluwer products integrate. Internal audience: WK product engineers first (code snippets, integration best practices), product managers and marketing second (capabilities, screenshots). English only; no translation pipeline (unlike `LibratechAI/documentation`).

## Source of truth

The SDK lives in `LibratechAI/sandbox`, `packages/sdk/`. The docs *derive* from it — never document behaviour that isn't in one of these:

- `packages/sdk/README.md` — the API contract and integration guidance. Guides and reference pages restate it; when they disagree, the README wins.
- `packages/sdk/CHANGELOG.md` — what shipped, per version (`## X.Y.Z - YYYY-MM-DD`). `## Unreleased` is merged-but-not-released: never document it.
- `packages/sdk/site/` — the hosted site at https://sdk.staging.libratech.ai (Docs / Changelog / Playground tabs). The playground is what we screenshot.

Do not publish internal-only detail: `packages/sdk/SPEC.md` internals (shims, bundling), M2M client ids/secrets, anything security-sensitive, roadmap, internal feature-flag names, or behaviour that is flag-gated/entitlement-gated rather than generally available. Releases are cut by a `chore(sdk): release vX.Y.Z` PR into `staging`; the Artifactory publish + WK CDN promotion follow automatically.

### The README is not always right

Verified 2026-08-27 against `main`: `packages/sdk/README.md` omits `LibraAuthErrorReason` and two of its five members, drops `'web_search'` from the printed `ResearchSourceId` union, never mentions the `baseUrl` origin validation, the init-twice no-op, the attach-target auto-detach, the `X-Libra-SDK-Version` header, or the embedding-origin allowlist, and describes SDK storage as living in "the iframe's localStorage" when the blob iframe inherits the **host page's** origin. Where these docs and the README disagree, the pages cite `packages/sdk/src` and say so. **When a page contradicts the README on purpose, leave the note explaining why** — otherwise a later sync will "fix" it back.

### Product decks are input, not truth

`Embedded Libra Assistant - SDK v2` (WK product deck, April 2026) is the source for host-side UX guidance — panel placement, the persistent "Ask Libra" entry point, the promo card, the 480px default width. It is **partly stale on product behaviour**: its "Standard / Deep Thinking / Fast" chat-mode selector is now a combined tier+model control, Deep Thinking is not tier-gated, its `622px` label breakpoint does not exist in the codebase, and its PRIVATE/TEAM project tags are now access pills. Every deck claim that reached these docs was checked against `LibratechAI/sandbox` first. Attribute design guidance that is not in the code explicitly ("Wolters Kluwer design guidance ... not enforced by the SDK") rather than stating it as SDK behaviour.

### Naming

`@libra/sdk` is the package; **the embedded widget** is the surface. WK material calls that surface the **Libra Add-in** — these docs avoid "add-in" because in the Libra codebase it means the **Word/Outlook add-ins**, a separate surface with its own chat list. Say so once per page where confusion is likely, and never use "add-in" unqualified.

## Generated files — don't hand-edit

- `changelog.mdx` and `snippets/sdk-version.mdx` — `node scripts/sync-changelog.mjs` (reads `CHANGELOG.md` from `origin/main` via `gh api`; `--file <path>` for a local copy; `--check` exits 1 if stale).

Pages show the current version with `import { sdkVersion } from '/snippets/sdk-version.mdx'` → `{sdkVersion}`. Inside code blocks keep the literal `<VERSION>` placeholder, as the README does.

## Commands

```bash
mint dev                                  # local preview, http://localhost:3000 (Node 22; see ~/.local/bin/mint)
node scripts/check.mjs                    # structural gate: nav ↔ files, links, assets, TODO-screenshot worklist
node scripts/sync-changelog.mjs           # regenerate changelog.mdx + version snippet
node scripts/release-scan.mjs             # what shipped since the docs' synced version, bucketed by page
cd Screenshots && npm run auth            # headed login on the playground → auth/storageState.json (manual gate)
cd Screenshots && npm run capture -- --all   # screenshots per manifest/shots.yaml → assets/images/sdk/
cd Screenshots && npm run render -- --all    # videos per manifest/storyboards.yaml → assets/videos/
cd Screenshots && npm run check:serve        # render every changed page on mint dev; fails on broken img/video/404
```

There is no build/test suite beyond these. Mintlify deploys `main` automatically via the GitHub app.

## Page conventions

- Frontmatter: `title`, `description` (sentence, ends without a period is fine), optional `sidebarTitle`.
- Audience split: `getting-started/` + `guides/` + `reference/` are for engineers; `capabilities/` is for product managers and marketing and must stay free of code. `guides/panel-and-placement` is the one page written for both — it is the host-side UX contract.
- Second person, sentence-case headings, language tag on every code block. Code that exists in the README is copied verbatim, not paraphrased.
- Developer pages lead with the snippet; PM/marketing pages (`capabilities/`) lead with what the end user sees.
- Screenshots live in `assets/images/sdk/<subject>-<state>.png` and are referenced as `<img src="/assets/images/sdk/…" alt="…" />`. A shot that is planned but not yet captured is a `{/* TODO screenshot: <manifest-id> */}` comment on the page and an entry in `Screenshots/manifest/shots.yaml` — `node scripts/check.mjs` lists them as the capture worklist. Never reference an image that doesn't exist.
- Header videos: `<video autoPlay muted loop playsInline src="/assets/videos/<slug>.webm" className="rounded-xl border w-full" />`, rendered from a `Screenshots/manifest/storyboards.yaml` scene. Until rendered, the page carries `{/* TODO video: <scene-id> */}` instead (also listed by `check.mjs`).
- Internal links are root-relative (`/guides/embedding`); Lucide icons.
- In MDX prose, `{`, `}` and a bare `<` are JSX — keep them inside backticks or escape them.

## Screenshots

`Screenshots/` is the Playwright capture harness ported from the documentation repo (`Screenshots/README.md`). Target is the staging playground; selectors resolve *inside the SDK iframe* by default, `host:` prefix targets the host page. Authenticated shots need `npm run auth` first — the one manual gate (Auth0 popup). Every manifest `output` must be referenced by a page (`npm run validate`).

Two traps that cost a full re-capture on 2026-08-27, both now guarded in-file:

- **`manifest/shots.yaml` order is load-bearing.** `locale-de` calls `Libra.setLocale('de-DE')`, which the SDK persists to `localStorage`; because the runner reuses one browser context per auth flag, every later auth shot came out in German. It runs last, and `chat-hero` (the session it chains from) second-to-last.
- **`mint dev` does not hot-reload `docs.json` navigation.** A leftover dev server serves a stale sidebar while pages themselves look fine, so a `check:serve` run can pass while showing the wrong nav. `visual_check.ts` now kills the whole process group; if the sidebar looks wrong, check for a stray listener on 3000-3005 before believing it.

**Eyeball every new PNG and video frame.** A wrong selector yields a wrong picture, not an error — this is how the German-locale leak was found. Never ship a splash, spinner, or empty state as a result shot: `chat-hero` deliberately asks a live question and waits for `.cited-sources-button` plus a rendered Regenerate action.

## Keeping the site current

`.claude/skills/sdk-docs-update/SKILL.md` is the release-driven pipeline: scan → sync changelog → update the affected pages → capture/render assets → check → PR. Use it when the user says "update the SDK docs", "what shipped in the SDK", or a new SDK version is out.

## Git

Branch from `main` (`docs/sdk-vX.Y.Z` for release updates), open a PR, never `--no-verify`. Keep content commits and asset commits separate.
