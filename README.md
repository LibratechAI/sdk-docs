# Mintlify Starter Kit

Use the starter kit to get your docs deployed and ready to customize.

Click the green **Use this template** button at the top of this repo to copy the Mintlify starter kit. The starter kit contains examples with

- Guide pages
- Navigation
- Customizations
- API reference pages
- Use of popular components

**[Follow the full quickstart guide](https://starter.mintlify.com/quickstart)**

## AI-assisted writing

Set up your AI coding tool to work with Mintlify:

```bash
npx skills add https://mintlify.com/docs
```

This command installs Mintlify's documentation skill for your configured AI tools like Claude Code, Cursor, Windsurf, and others. The skill includes component reference, writing standards, and workflow guidance.

See the [AI tools guides](/ai-tools) for tool-specific setup.

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview your documentation changes locally. To install, use the following command:

```
npm i -g mint
```

Run the following command at the root of your documentation, where your `docs.json` is located:

```
mint dev
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Install our GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) to propagate changes from your repo to your deployment. Changes are deployed to production automatically after pushing to the default branch.

## Handover

New to this repo? Start with [HANDOVER.md](HANDOVER.md).

## SDK docs update pipeline

This site's changelog and pages are kept in sync with SDK releases (`sdk-v*`
tags in `LibratechAI/sandbox`) by a daily scan + asset pipeline, adapted from
the equivalent pipeline in `LibratechAI/documentation`:

- [scripts/sdk-release-scan.mjs](scripts/sdk-release-scan.mjs) — finds new SDK
  releases since the documented version and their SDK-scoped changes.
- [assets-pipeline/](assets-pipeline/) — captures updated SDK playground
  screenshots via Playwright, gated behind a manual headed login (never
  personal credentials — see [assets-pipeline/README.md](assets-pipeline/README.md)).
- [.claude/skills/sdk-daily-update/SKILL.md](.claude/skills/sdk-daily-update/SKILL.md) — the full runbook.

## Need help?

### Troubleshooting

- If your dev environment isn't running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources
- [Mintlify documentation](https://mintlify.com/docs)
