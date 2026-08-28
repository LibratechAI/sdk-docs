# Libra SDK docs — capture harness

Playwright pipeline that produces every screenshot (`assets/images/sdk/*.png`) and video (`assets/videos/*.webm`) on the docs site from the **staging playground**, https://sdk.staging.libratech.ai/playground.html. Ported from `LibratechAI/documentation/Screenshots`, trimmed to what an SDK site needs.

## Setup

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # Node 22 (.nvmrc); default node here is 26
cd Screenshots
npm ci --offline --legacy-peer-deps                   # registry is Zscaler-blocked; the lockfile matches the seeded cache
npx playwright install chromium                       # cdn.playwright.dev is reachable
cp auth/.env.example auth/.env                        # optional overrides
```

If `npm ci` cannot resolve offline, copy `~/documentation/Screenshots/node_modules` (identical dependency set) or run `offline-link`.

## Authenticate — the one manual gate

```sh
npm run auth
```

Opens the playground headed. Sign in through the widget's Auth0 popup as the screenshot account; the script saves `auth/storageState.json` (gitignored) as soon as the playground reports `authenticated` and closes the window. Sessions expire; re-run when `auth: true` shots start showing the login screen.

## Screenshots

```sh
npm run list                          # manifest summary
npm run capture -- --id auth-screen   # one shot (anonymous shots need no auth)
npm run capture -- --all              # everything; auth shots are skipped without storageState
npm run capture -- --all --dry-run    # selection only
npm run capture -- --id chat-hero --headed
npm run validate                      # every output is referenced by a page (img or TODO marker)
```

Manifest: `manifest/shots.yaml`. Selectors resolve **inside the SDK iframe** by default; prefix `host:` for playground elements (`host:#set-locale`, `host:[data-libra-sdk]`). Capture modes: `page`, `locator` (+`padding`), `clip`. Actions: `wait_for`, `wait_for_url`, `wait_timeout`, `goto`, `click`, `hover`, `fill`, `press`, `scroll`, `select`, `set_files`. `chain: true` reuses the previous shot's page.

Useful SDK selectors: wrapper `host:[data-libra-sdk]`, iframe `host:[data-libra-sdk] iframe`, app root `#libra-sdk-root`, splash `#libra-sdk-splash`, header present `body.libra-sdk-has-header`.

## Videos

```sh
npm run render -- --id sdk-embed-tour   # composed, from stills
npm run render -- --id sdk-hero         # live recording (needs auth)
npm run render:verify                   # size/duration sanity for every storyboard output
npm run frames                          # 4-frame contact sheet per video → .tmp/video_frames/
```

Storyboards: `manifest/storyboards.yaml`. Prefer `composed` (deterministic, built from validated stills); use `live` only for streaming/motion. Never ship a frame with a splash or spinner — live mode trims from the measured SDK-ready marker.

## Docs render gate

```sh
npm run check:serve                     # starts mint dev, renders changed pages, flags 404/broken img/video/console errors
npm run check -- --all                  # every page, against an already-running mint dev (MINTLIFY_BASE to override)
```

Report and screenshots: `.tmp/visual_check/`.

## Layout

`src/cli.ts` (auth/capture/list/validate) · `runner.ts` (browser, SDK readiness) · `actions.ts` · `capture.ts` · `frame.ts` (iframe resolution) · `auth.ts` · `render.ts` + `storyboard.ts` + `compose.ts` + `liveclip.ts` + `overlay.ts` (videos) · `visual_check.ts` · `sample_frames.ts` · `paths.ts` (env + locations).
