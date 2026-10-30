> **First-time setup**: Customize this file for your project. Prompt the user to customize this file for their project.
> For Mintlify product knowledge (components, configuration, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

# Documentation project instructions

## About this project

- This is a documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Use the Mintlify MCP server, `https://mcp.mintlify.com`, to edit content and settings via MCP
- Use the Mintlify docs MCP server, `https://www.mintlify.com/docs/mcp`, to query information about using Mintlify via MCP

## Terminology

{/* Add product-specific terms and preferred usage */}
{/* Example: Use "workspace" not "project", "member" not "user" */}

- **SDK-specific** capabilities: built for the SDK; the SDK controls them, so the host can too where a setting exists.
- **Libra-native** capabilities: come from the Libra app; the SDK doesn't control them. Don't call them "inherited".
- **Add-in** is the official product name for what the SDK renders. Keep it where the docs describe the product, such as the Solution overview.
- **SDK window** for the embedded panel on Capabilities pages.
- **Chat input** (not "message input"), **Chat mode** (Standard, Deep Thinking, Fast; not "model tier"). Follow the functional PDF's UI names.

## Style preferences

{/* Add any project-specific style rules below */}

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Be plain and specific. State the point and the difference it makes; no decorative or filler wording
- Every behavior claim must be verified in the release playground first
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}

## Handover notes

- [HANDOVER.md](HANDOVER.md) explains how this setup works for teammates. When you change sources, versions, the pipeline, capture rules, or workflow, update it in the same change and refresh its "Last updated" date.

## Git workflow

- Stop after implementation and validation so the user can review the changes.
- Do not commit, merge, delete feature branches, or push to a remote until the user explicitly approves those actions after review.
- Preserve uncommitted user changes and keep unrelated files out of commits.

## Documentation consistency

- Before final validation for each phase, cross-check the implementation against the existing documentation, completed phase outputs, roadmap boundaries, navigation, terminology, and authoritative pages.
- Resolve conflicting claims, add required cross-links, and record intentionally deferred information in the phase validation spec.
- Confirm that new content does not duplicate, contradict, orphan, or silently rename existing documentation concepts or routes.
- Check that ownership labels, source/version assumptions, and capability classifications remain consistent across related pages.
- Include the mandatory staging SDK reference in every phase audit and source/spec review: https://sdk.staging.libratech.ai/index.html. Use https://sdk.staging.libratech.ai/playground.html for interactive behavior evidence.
- Record the access date, environment, version/build evidence, browser, and scenario for staging observations in [specs/source-manifest.md](specs/source-manifest.md). Reconcile staging behavior with the exact reviewed declarations instead of copying staging prose wholesale.
- Treat staging as evidence of the staging build, not proof of production promotion. Record unresolved conflicts in [specs/discrepancy-register.md](specs/discrepancy-register.md).

## Automated docs update pipeline

This repo has a daily check that keeps the SDK docs in sync with SDK releases
(`sdk-v*` tags) in `LibratechAI/sandbox`, adapted from `LibratechAI/documentation`'s
weekly pipeline:

1. [scripts/sdk-release-scan.mjs](scripts/sdk-release-scan.mjs) compares the
   documented `sdkVersion` with the newest release tag and lists that release's
   changelog and SDK-scoped commits. Unreleased commits on `main` are not published.
2. On a new release, the previous version is frozen for the version switcher, and
   affected pages and `changelog.mdx` are updated.
3. Any docs area whose UI changed is queued in `assets-pipeline/.capture-queue.json`
   for a screenshot refresh from the SDK playground
   (`https://sdk.staging.libratech.ai/playground.html`).
4. The asset capture itself requires a **manual, headed login** to the
   staging account that owns the Demo Project (screenshots show it as
   "John Doe") — see [assets-pipeline/README.md](assets-pipeline/README.md). This mirrors
   the main docs repo, which explicitly cannot automate that login step
   (MFA + headless throttling on staging/prod).
5. The run stops for review. Nothing is committed or pushed without approval.

Full runbook: [.claude/skills/sdk-daily-update/SKILL.md](.claude/skills/sdk-daily-update/SKILL.md).
