# SDK docs asset pipeline

Playwright-based screenshot capture for the [SDK playground](https://sdk.staging.libratech.ai/playground.html),
feeding images into the docs pages in this repo. Mirrors the pattern used in
`LibratechAI/documentation`'s `Screenshots/` pipeline, adapted for the SDK.

## Why there's a manual gate

Login to the playground can require MFA, and headless Chromium is throttled
on staging/prod. So this pipeline is split in two:

1. **`npm run auth`** — headed, run by a human, logs in to the staging
   account that owns the Demo Project and saves a session
   (`auth/storageState.json`, gitignored). The saved token currently lasts
   about a day, so log in again before each capture session.
2. **`npm run capture`** — headless, unattended, reuses that saved session
   to walk `manifest/components.yaml` and take screenshots. If the session
   has expired, the capture fails and tells you to run `auth` again.

The release scanner ([scripts/sdk-release-scan.mjs](../scripts/sdk-release-scan.mjs))
never logs in itself — it only decides *which* components need a fresh
capture and records that in `.capture-queue.json`. A human (or a scheduled
job with a still-valid session) runs `capture` afterwards.

## Setup

```bash
cd assets-pipeline
npm install
npx playwright install chromium
```

For a local auth run, prefer shell variables so the credentials are not saved
in a file:

```bash
read -r "CAPTURE_ACCOUNT_EMAIL?Capture account email: "
read -r -s "CAPTURE_ACCOUNT_PASSWORD?Capture account password: "
printf '\n'
export CAPTURE_ACCOUNT_EMAIL CAPTURE_ACCOUNT_PASSWORD
```

## Capture targets

The published docs describe one SDK release, set by `sdkVersion` in
`manifest/components.yaml`. Pick the playground build with `--target`:

| Target | Playground | Use for |
| --- | --- | --- |
| `release` (default) | `/versions/v<sdkVersion>/` on staging | Published docs. The capture fails if the page runs any other SDK build. |
| `next` | Staging head (`/playground.html`) | Drafting docs for the next release on a docs branch. Includes unreleased and possibly flagged work. |
| `local` | `LOCAL_PLAYGROUND_URL`, default `http://localhost:5400` | Optional. A sandbox `packages/sdk` `npm run dev` playground, for work not yet on staging. Needs its own login (`npm run auth -- --target local`). |

Every capture is recorded in `manifest/captures.json` with its target, URL,
the SDK version the page reported (`X-Libra-SDK-Version`), and the time.
`npm run validate` warns about captures that don't come from the release
target for the current `sdkVersion`.

### Release workflow

1. **Before a release:** on a docs branch, draft the changes from the staging
   changelog's Unreleased section and `node scripts/sdk-release-scan.mjs
   --branch staging`. Capture with `--target next` and review the Mintlify
   preview. Don't merge yet.
2. **After the release:** set `sdkVersion` to the new version, run
   `npm run capture` (release target), review the image diffs, and merge.

## Commands

```bash
npm run auth                       # headed login, refresh the session
npm run auth -- --target local     # separate login for the local playground
npm run list                       # show manifest components
npm run capture                    # capture every component from the release playground
npm run capture -- --target next   # capture from the staging head
npm run capture -- --ids sdk-file-picker-project   # capture specific ids
npm run validate                   # references, missing images, stale captures
```

## Manifest

`manifest/components.yaml` maps playground UI states to docs images:
route, actions (click/fill/hover) to reach the state, the element selector
to screenshot, and the output path. Prefer `[data-testid=...]` selectors;
CSS classes and XPath are banned because they break silently when the
playground UI changes. Use `frame: iframe` in an action or component when the
state lives inside the SDK iframe; use `frame` on the component to capture an
inner SDK element or its `body`.

Capture rules:

- Wait for loaded content with `waitFor` (and `waitForHidden` for loaders)
  before capturing. Never rely on the click alone.
- Use `selector: viewport` for any feature that opens UI outside the SDK
  sidebar (for example, the Document Viewer) so both surfaces are visible.
- Captures run at 1440x900 and 2x scale unless a component sets `viewport`.
- The SDK sidebar is 460px wide so the **Continue in Libra** label is visible.
  Set `sidebarWidth` on a component only when you show responsive behavior.
- The playground tab bar (Docs, Changelog, Playground) is always cropped out.
- Screenshots show the user as **John Doe**. The top-level `sessionUser` in
  `manifest/components.yaml` replaces fields of the signed-in user the SDK
  loads, only inside the capture browser; the account itself is unchanged.
  A component can add its own `sessionUser` to mock account states.
- `apiOverrides` (top level or per component) replaces fields in other API
  responses by path, for example `/api/v1/teams/owner` for the team manager.
  Check every capture for real names, emails, or account data before use.
- A Wolters Kluwer research source is active, not web search. The top-level
  `playgroundConfig` presets the playground's SDK options before each capture
  (`researchSources: [wko_de]`). Override it on a component only when the
  example needs another source.
- Set `video: true` and an `.mp4` output to record an interaction. Videos
  show a pointer for each click, and `clipStart` marks where the clip begins.
- Voice input captures set `fakeMic: fixtures/voice-prompt.wav`. Chromium
  plays the file as the microphone, in a loop; the trailing silence keeps the
  sentence from repeating. To change the prompt, regenerate the file with
  macOS `say -o voice.wav --data-format=LEI16@16000 "..."` and pad it with
  silence (`ffmpeg ... -af apad=pad_dur=4`).
- To number controls on a screenshot, list them under `annotations` in the
  order the page describes them. The image stays clean: capture measures each
  control and writes its position to `snippets/screenshot-markers.jsx`
  (generated, never edit it). Pages draw the numbers with the
  `AnnotatedImage` component and pass the labels in the same order, with the
  `<img>` as the component's child so Mintlify's click-to-zoom still works.
  Number only the controls that matter for that example; don't re-explain
  the SDK header or other common controls on every screenshot.
  `npm run validate` fails when an annotated capture has no measured markers.
- Open every new capture and confirm it shows the intended, fully loaded
  state before referencing it in the docs.

## Demo project

Captures use a **Demo Project** that mirrors the demo project in the Libra UX
Figma file. All documents are fictional and in English. To seed a new capture
account:

1. Run `npm run demo:files` to generate `demo-content/files/` from
   `demo-content/documents.ts`.
2. In the playground, open the project selector, select **New project**, and
   create **Demo Project** with the description "A simple project to help you
   get started quickly."
3. With **Demo Project** active, select **Tools** > **Upload files from
   computer** and upload all four files.
4. Attach `Share Purchase Agreement - Draft 2` and send: "Can we double-check
   the liability cap in clause 7.2? What is the cap, and how does it compare
   with the Buyer's proposal?" Libra titles the chat "Liability Cap Review",
   which the viewer captures open.

## Credentials

The recommended local workflow keeps credentials in shell variables for the
single headed auth run. The CLI also accepts `auth/.env` for temporary local or
CI use, but treat that file as plaintext secret material and delete it after
the session is created. Never commit `auth/.env` or `auth/storageState*.json`
(all gitignored).
For now, captures use a team member's staging account with the seeded Demo
Project; `sessionUser` keeps their name out of screenshots. A dedicated
`sdk-docs-capture` account remains the preferred long-term setup.
