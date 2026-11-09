#!/usr/bin/env node
/**
 * Daily SDK release scanner for the Libra SDK docs pipeline.
 *
 * Mirrors LibratechAI/documentation's scripts/release-scan.mjs, inverted:
 * that scanner EXCLUDES sdk-scoped commits from the product docs; this one
 * scans the same sandbox repo but keeps ONLY commits touching `packages/sdk`,
 * since the SDK docs site is the dedicated write-up for that surface.
 *
 * Lists what shipped to PRODUCTION (origin/main in the sandbox repo) since
 * the last changelog entry, classifies SDK-relevant vs. not, and buckets the
 * SDK-facing changes by docs area so the daily docs update is a mechanical
 * follow-on. Also writes assets/.capture-queue.json entries for any bucket
 * that implies a playground screenshot/video refresh (see scripts/README.md
 * and .claude/skills/sdk-daily-update/SKILL.md).
 *
 * Usage:
 *   node scripts/sdk-release-scan.mjs                     # new sdk-v* releases since the documented sdkVersion
 *   node scripts/sdk-release-scan.mjs --from 0.15.0         # compare from this version instead of sdkVersion
 *   node scripts/sdk-release-scan.mjs --since 2026-09-01  # date window on origin/main instead (committer date)
 *   node scripts/sdk-release-scan.mjs --until 2026-09-08  # end of the date window
 *   node scripts/sdk-release-scan.mjs --sandbox /path      # default $SANDBOX_PATH or ./.sandbox-checkout
 *   node scripts/sdk-release-scan.mjs --fetch              # `git fetch origin` first (network)
 *   node scripts/sdk-release-scan.mjs --all                # also print the excluded buckets
 *   node scripts/sdk-release-scan.mjs --json               # machine-readable output
 *   node scripts/sdk-release-scan.mjs --check-coverage      # exit 1 if a docs.json page has no owner area
 *   node scripts/sdk-release-scan.mjs --branch staging     # pre-release track: SDK commits after the newest release tag
 *
 * Source of truth: `sdk-v*` tags in LibratechAI/sandbox. Releases are tagged
 * on staging and published to npm/CDN from the tag, before main catches up.
 * The SDK UI ships inside the npm/CDN bundle, so a packages/sdk commit
 * reaches integrators only when a release is tagged. By default the scan
 * compares the documented `sdkVersion` (assets-pipeline/manifest/components.yaml)
 * with the newest tag and lists the commits and CHANGELOG.md sections in
 * between. With no new release it prints the CHANGELOG "Unreleased" section
 * for the pre-release track and never writes the capture queue. With
 * `--branch staging`, the scan lists every packages/sdk commit on
 * origin/staging after the newest release tag (pre-release captures use
 * `capture --target next`).
 * PRs are
 * squash- or merge-committed, so `--no-merges` is the unit of "what shipped"
 * and automatically excludes release/sync merge commits.
 *
 * Relevance is path-scoped (`-- packages/sdk`), not scope/keyword-guessed:
 * real commit history shows most SDK-touching commits use unrelated
 * conventional-commit scopes (`feat(chat)`, `feat(assistant)`, ...), so
 * text matching alone silently misses genuine SDK changes. Scope/keyword
 * matching is used only afterward, to route an already-confirmed SDK commit
 * to the right docs area.
 *
 * This is a TRIAGE aid, not an oracle: it drafts the buckets, a human (or
 * the daily agent run) confirms what's genuinely SDK-user-facing and writes
 * the prose. See .claude/skills/sdk-daily-update/SKILL.md.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CHANGELOG = path.join(REPO_ROOT, "changelog.mdx");
const MANIFEST = path.join(REPO_ROOT, "assets-pipeline", "manifest", "components.yaml");
const CAPTURE_QUEUE = path.join(REPO_ROOT, "assets-pipeline", ".capture-queue.json");

// ---- Classification rules -------------------------------------------------

// Commit-type prefixes that are never user-facing.
const SKIP_PREFIXES = new Set([
  "chore", "refactor", "build", "ci", "test", "tests", "style", "perf",
  "revert", "wip", "release", "deps", "bump", "docs", "doc", "infra",
]);

// Scopes that are developer/internal/infra even when prefixed feat/fix.
const SKIP_SCOPES = new Set([
  "eval", "evals", "evaluations", "monkey", "cost-model", "auth0", "db",
  "migration", "telemetry", "logging", "otel", "sentry", "terraform", "helm",
  "k8s", "docker", "loadbalancer", "lb", "server", "waf", "vitest", "prod",
  "staging", "build", "app", "web", "backend",
]);

// Anything matching these (in the subject) is excluded as security-sensitive
// or infra, even if it touches packages/sdk. Never put security implications
// or infra in the changelog.
const EXCLUDE_KEYWORDS = [
  "security", "csrf", "xss", "cve", "vuln", "sanitiz", "rate limit", "ratelimit",
  "dependabot", "bump ", "lockfile", "flaky", "lint", "typecheck", "coverage",
  "dockerfile", "kubernetes", "load balancer", "loadbalancer", "feature flag off",
  "waf", "nginx", "prod.yaml", "staging.yaml", "vitest", "e2e test", "unit test",
];

// Scope (or subject keyword) -> docs area + whether it implies a playground
// asset refresh (screenshot/video of the SDK playground). Keep this in sync
// with docs.json navigation and assets-pipeline/manifest/components.yaml.
//
// Verified against real commit history on 2026-09-24: `sdk-widget`,
// `sdk-theming`, `sdk-events`, `embed`, `embeddable`, and `playground` have
// never been used as real conventional-commit scopes, and no theming API
// exists in the public SDK contract, so those buckets were removed rather
// than kept as unverified placeholders. Playground UI changes route to
// integration/playground.mdx and are asset-queued for a fresh overview capture.
const SCOPE_MAP = [
  { area: "Installation & setup", pages: "integration/quickstart.mdx", scopes: ["sdk-auth", "install"], kw: ["install", "getting started", "quickstart", "npm", "cdn"], asset: false },
  { area: "Lifecycle & configuration", pages: "integration/lifecycle.mdx, integration/configuration.mdx, integration/embedding-constraints.mdx, capabilities/sdk-window.mdx", scopes: ["sdk-widget", "widget", "embed", "embeddable"], kw: ["init(", "attach(", "detach(", "destroy(", "lifecycle", "mount", "z-index", "stacking", "embed", "widget"], asset: true },
  { area: "Authentication", pages: "integration/authentication.mdx, integration/bff-authentication.mdx, capabilities/sign-in-and-onboarding.mdx", scopes: ["sdk-auth", "onboarding"], kw: ["auth", "signin", "signup", "sign-in", "sign-up", "popup", "onboarding"], asset: true },
  { area: "Proxy / BFF", pages: "integration/bff-authentication.mdx, integration/trusted-origins.mdx", scopes: [], kw: ["proxy", "bff", "token exchange"], asset: false },
  { area: "Host integrations", pages: "integration/attachments.mdx, integration/suggestions.mdx, integration/add-attachments.mdx, integration/citation-clicks.mdx, capabilities/current-document.mdx, capabilities/citation-navigation.mdx", scopes: [], kw: ["citation", "suggestion", "attachment", "document suggestion"], asset: true },
  { area: "Navigation & handoffs", pages: "integration/navigation-and-handoffs.mdx, capabilities/handoffs.mdx", scopes: [], kw: ["openchatbyid", "chat.open", "handoff", "deep link", "new chat", "fresh conversation"], asset: false },
  { area: "Locales", pages: "integration/locales.mdx, capabilities/language.mdx", scopes: ["sdk-events"], kw: ["locale", "i18n", "translation"], asset: false },
  { area: "Document viewer", pages: "integration/document-viewer.mdx, capabilities/document-viewer.mdx", scopes: ["preview"], kw: ["viewer", "pdf", "doc-viewer"], asset: true },
  { area: "Deployment & security", pages: "integration/deployment-security.mdx, integration/trusted-origins.mdx, integration/production-readiness.mdx", scopes: [], kw: ["csp", "content-security-policy", "permissions-policy", "worker", "containing block", "frame-ancestors"], asset: false },
  { area: "Playground", pages: "integration/playground.mdx", scopes: ["playground"], kw: ["playground"], asset: true },
  { area: "Core SDK (unrouted)", pages: "reference/overview.mdx, integration/overview.mdx", scopes: ["sdk", "libra-sdk", "sdk-theming"], kw: [], asset: true },
];

// Fallback bucket for any packages/sdk commit that doesn't match a more
// specific area above. Path-scoping already proved SDK relevance, so an
// unrouted commit is still surfaced here rather than silently dropped.
const CORE_SDK_BUCKET = SCOPE_MAP[SCOPE_MAP.length - 1];

// Pages that packages/sdk commits can't drive: product overviews, Libra-native
// capabilities (they follow the main app), status, and the changelog itself.
// The coverage check accepts them; the runbook reviews them on every release.
const REVIEW_EACH_RELEASE = [
  "index", "solution/overview", "capabilities/overview",
  "capabilities/chat-and-answers", "capabilities/research-sources-and-citations",
  "capabilities/files-and-tools", "capabilities/assistants-history-projects",
  "status/overview", "status/faq", "changelog",
];

// ---- Argument parsing -----------------------------------------------------

function parseArgs(argv) {
  const args = { sandbox: process.env.SANDBOX_PATH || path.join(REPO_ROOT, ".sandbox-checkout"), branch: "main" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") args.since = argv[++i];
    else if (a === "--until") args.until = argv[++i];
    else if (a === "--sandbox") args.sandbox = argv[++i];
    else if (a === "--branch") args.branch = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--fetch") args.fetch = true;
    else if (a === "--all") args.all = true;
    else if (a === "--json") args.json = true;
    else if (a === "--write-queue") args.writeQueue = true;
    else if (a === "--check-coverage") args.checkCoverage = true;
    else if (a === "--help" || a === "-h") {
      console.log("node scripts/sdk-release-scan.mjs [--from X.Y.Z] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--sandbox PATH] [--branch main|staging] [--fetch] [--all] [--json] [--write-queue] [--check-coverage]");
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (args.branch !== "main" && args.branch !== "staging") {
    console.error(`Unsupported --branch "${args.branch}". Use main or staging.`);
    process.exit(2);
  }
  return args;
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function labelToDate(label) {
  let m = label.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = label.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}
const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

async function detectSince() {
  try {
    const text = await readFile(CHANGELOG, "utf8");
    // Release labels are "Release: X.Y.Z"; the date is the italic line after the tag.
    const entries = [...text.matchAll(/<Update\s+label="([^"]+)"[^>]*>\s*(?:_([^_\n]+)_)?/g)];
    const dates = entries.map((m) => labelToDate(m[2] || "") || labelToDate(m[1])).filter(Boolean).sort();
    if (dates.length) return dates[dates.length - 1];
  } catch {
    // no changelog yet
  }
  // Daily cadence default: yesterday.
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function todayISO() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ---- Git extraction -------------------------------------------------------

const FS = "\x1f";
const RS = "\x1e";

// Path-scoped to `packages/sdk`: this is the primary SDK-relevance signal.
// Verified against real history (2026-09-24) that scope/keyword text alone
// misses genuine SDK changes landed under unrelated commit scopes.
function gitLog(sandbox, range) {
  const out = execFileSync(
    "git",
    ["-C", sandbox, "log", ...range, "--no-merges",
      `--pretty=format:%H${FS}%h${FS}%cI${FS}%s${FS}%b${RS}`, "--", "packages/sdk"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split(RS).map((r) => r.trim()).filter(Boolean).map((rec) => {
    const [hash, short, date, subject, body = ""] = rec.split(FS);
    return { hash, short, date, subject, body };
  });
}

// ---- Releases -------------------------------------------------------------

const cmpVersion = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

async function documentedVersion() {
  try {
    const text = await readFile(MANIFEST, "utf8");
    return (text.match(/^sdkVersion:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m) || [])[1] || null;
  } catch {
    return null;
  }
}

function releaseTags(sandbox) {
  const out = execFileSync("git", ["-C", sandbox, "tag", "--list", "sdk-v*"], { encoding: "utf8" });
  return out.split("\n").map((t) => t.trim()).filter((t) => /^sdk-v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(5)).sort(cmpVersion);
}

// Sections of packages/sdk/CHANGELOG.md at `ref`, keyed by "Unreleased" or the version.
function sdkChangelog(sandbox, ref) {
  let text = "";
  try {
    text = execFileSync("git", ["-C", sandbox, "show", `${ref}:packages/sdk/CHANGELOG.md`], { encoding: "utf8" });
  } catch {
    return new Map();
  }
  const sections = new Map();
  for (const part of text.split(/^## /m).slice(1)) {
    const [heading, ...body] = part.split("\n");
    const key = heading.trim().toLowerCase() === "unreleased" ? "Unreleased" : heading.split(/\s+-\s+/)[0].trim();
    sections.set(key, { heading: heading.trim(), body: body.join("\n").trim() });
  }
  return sections;
}

// ---- Classification -------------------------------------------------------

function parseSubject(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/);
  const pr = (subject.match(/\(#(\d+)\)/) || [])[1] || null;
  if (m) return { type: m[1].toLowerCase(), scope: (m[2] || "").toLowerCase(), breaking: !!m[3], rest: m[4], pr };
  return { type: null, scope: "", breaking: false, rest: subject, pr };
}

function classify(commit) {
  const { type, scope, rest } = parseSubject(commit.subject);
  const subjLower = commit.subject.toLowerCase();

  // `gitLog()` already path-scoped this commit to packages/sdk, so relevance
  // is established. From here we only exclude non-user-facing or
  // security/infra noise, then route to a docs area (falling back to the
  // unrouted Core SDK bucket rather than dropping it).
  if (EXCLUDE_KEYWORDS.some((k) => subjLower.includes(k))) return { keep: false, reason: "security/infra keyword", scope };
  if (scope && SKIP_SCOPES.has(scope)) return { keep: false, reason: `skip scope (${scope})`, scope };
  if (type && SKIP_PREFIXES.has(type)) return { keep: false, reason: `skip prefix (${type})`, scope };

  const bucket = routeBucket(scope, rest || commit.subject) || CORE_SDK_BUCKET;
  if (type === "feat" || type === "fix") return { keep: true, reason: type, scope, bucket };
  if (!type) return { keep: "review", reason: "no conventional-commit prefix", scope, bucket };
  return { keep: "review", reason: `other prefix (${type}) touching packages/sdk`, scope, bucket };
}

function routeBucket(scope, text) {
  const t = (text || "").toLowerCase();
  // Keyword match first: `sdk` is an overloaded catch-all scope used for most
  // SDK commits regardless of what they actually touch, so checking scope
  // first would always win via Core SDK and starve every specific bucket
  // (e.g. a proxy fix or a viewer fix would never reach its own page).
  for (const e of SCOPE_MAP) {
    if (e.kw.some((k) => t.includes(k))) return e;
  }
  for (const e of SCOPE_MAP) {
    if (scope && e.scopes.includes(scope)) return e;
  }
  return null;
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    execFileSync("git", ["-C", args.sandbox, "rev-parse", "--git-dir"], { stdio: "ignore" });
  } catch {
    if (args.checkCoverage) {
      // CI has no sandbox clone; page ownership needs only docs.json.
      const coverage = await checkPageCoverage();
      printCoverage(console.log, coverage);
      process.exit(coverage.checked && !coverage.missing.length ? 0 : 1);
    }
    console.error(`Sandbox checkout not found or is not a Git repository: ${args.sandbox}`);
    console.error("Set SANDBOX_PATH or pass --sandbox /path/to/sandbox.");
    process.exit(1);
  }
  if (args.fetch) {
    process.stderr.write("Fetching origin…\n");
    execFileSync("git", ["-C", args.sandbox, "fetch", "origin", "--quiet"], { stdio: "inherit" });
  }
  const since = args.since || (args.until ? await detectSince() : null);
  const until = args.until || todayISO();
  const documented = args.from || (await documentedVersion());
  const tags = releaseTags(args.sandbox);
  const newest = tags[tags.length - 1] || null;
  const newReleases = documented ? tags.filter((t) => cmpVersion(t, documented) > 0) : [];

  // Mode: a date window on main (explicit --since/--until), the pre-release
  // track (--branch staging), or the default release comparison.
  let mode;
  let range = null;
  if (args.branch === "staging") {
    mode = "staging";
    range = [newest ? `sdk-v${newest}..origin/staging` : "origin/main..origin/staging"];
  } else if (since) {
    mode = "window";
    range = ["origin/main", `--since=${since}`, `--until=${until} 23:59:59`];
  } else {
    mode = "release";
    if (!documented) {
      console.error(`Could not read sdkVersion from ${path.relative(REPO_ROOT, MANIFEST)}.`);
      process.exit(1);
    }
    if (newReleases.length) range = [`sdk-v${documented}..sdk-v${newReleases[newReleases.length - 1]}`];
  }

  const commits = range ? gitLog(args.sandbox, range) : [];
  const changelogRef = mode === "staging" ? "origin/staging"
    : mode === "release" && newReleases.length ? `sdk-v${newReleases[newReleases.length - 1]}` : "origin/main";
  const sdkSections = sdkChangelog(args.sandbox, changelogRef);
  const notes = mode === "release" && newReleases.length
    ? newReleases.map((v) => sdkSections.get(v)).filter(Boolean)
    : [sdkSections.get("Unreleased")].filter(Boolean);

  const buckets = new Map();
  const review = [];
  const excluded = new Map();

  for (const c of commits) {
    const cls = classify(c);
    const entry = { ...c, ...cls, hasBody: c.body.trim().length > 0 };
    if (cls.keep === true) {
      const key = cls.bucket.area;
      if (!buckets.has(key)) buckets.set(key, { pages: cls.bucket.pages, asset: cls.bucket.asset, items: [] });
      buckets.get(key).items.push(entry);
    } else if (cls.keep === "review") {
      review.push(entry);
    } else {
      excluded.set(cls.reason.replace(/\(.*\)/, "").trim(), (excluded.get(cls.reason.replace(/\(.*\)/, "").trim()) || 0) + 1);
    }
  }

  const keptCount = [...buckets.values()].reduce((n, b) => n + b.items.length, 0);
  const coverage = await checkPageCoverage();
  if (args.checkCoverage && coverage.checked && coverage.missing.length) {
    process.exitCode = 1;
  }

  if (args.writeQueue && mode === "release" && newReleases.length) {
    const queue = {
      date: until,
      areas: [...buckets].filter(([, b]) => b.asset).map(([area, b]) => ({
        area, pages: b.pages, commits: b.items.map((i) => ({ hash: i.short, subject: i.subject, pr: i.pr })),
      })),
    };
    if (queue.areas.length) {
      await mkdir(path.dirname(CAPTURE_QUEUE), { recursive: true });
      await writeFile(CAPTURE_QUEUE, JSON.stringify(queue, null, 2) + "\n");
      process.stderr.write(`Wrote ${CAPTURE_QUEUE} (${queue.areas.length} area(s) need playground captures)\n`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ mode, branch: args.branch, documented, newest, newReleases, since, until, total: commits.length, kept: keptCount, review: review.length,
      buckets: Object.fromEntries([...buckets]), reviewItems: review, excluded: Object.fromEntries(excluded),
      sdkChangelog: notes, reviewEachRelease: REVIEW_EACH_RELEASE, coverage }, null, 2));
    return;
  }

  const line = (c) => `- **[${c.scope || c.reason}]** ${stripPrefix(c.subject)} — \`${c.short}\`${c.pr ? ` #${c.pr}` : ""}${c.hasBody ? " 📝" : ""}`;
  const P = (s) => process.stdout.write(s + "\n");

  if (mode === "staging") {
    P(`# SDK pre-release scan — on origin/staging after sdk-v${newest ?? "?"}`);
    P("");
    P(`Unreleased commits (--no-merges): **${commits.length}**`);
  } else if (mode === "window") {
    P(`# SDK commit scan — ${since} → ${until} on origin/main`);
    P("");
    P("Commits on main are not released until an sdk-v* tag ships them.");
    P(`Commits in window (--no-merges): **${commits.length}**`);
  } else if (!newReleases.length) {
    P(`# SDK release scan — no new SDK release since ${documented}`);
    P("");
    P(`Documented version: **${documented}**  ·  Newest release tag: **${newest ?? "none"}**`);
    P("Nothing to publish. Unreleased changes below are for the pre-release track only (`--branch staging`).");
  } else {
    P(`# SDK release scan — ${documented} → ${newReleases.join(", ")}`);
    P("");
    P(`Released commits (sdk-v${documented}..sdk-v${newReleases[newReleases.length - 1]}, --no-merges): **${commits.length}**`);
  }
  if (notes.length) {
    P("");
    P("## SDK changelog (packages/sdk/CHANGELOG.md)");
    for (const n of notes) {
      P("");
      P(`### ${n.heading}`);
      P(n.body || "_(empty)_");
    }
  }
  if (!commits.length) {
    printCoverage(P, coverage);
    return;
  }
  P("");
  P(`SDK user-facing (auto-bucketed): **${keptCount}**  ·  Needs human review: **${review.length}**  ·  Excluded: **${commits.length - keptCount - review.length}**`);
  P("");
  P("## SDK-facing changes by docs area");
  for (const [area, b] of [...buckets].sort((a, z) => z[1].items.length - a[1].items.length)) {
    P("");
    P(`### ${area}  _(→ ${b.pages}${b.asset ? ", playground capture needed" : ""})_`);
    for (const c of b.items) P(line(c));
  }
  if (review.length) {
    P("");
    P("## Needs human review (unmapped or un-prefixed)");
    for (const c of review) P(line(c));
  }
  if (args.all && excluded.size) {
    P("");
    P("## Excluded (not sdk-facing)");
    for (const [reason, n] of [...excluded].sort((a, z) => z[1] - a[1])) P(`- ${reason}: ${n}`);
  }

  if (mode === "release" && newReleases.length) {
    P("");
    P("## Review on every release");
    P(REVIEW_EACH_RELEASE.map((p) => `${p}.mdx`).join(", "));
  }
  printCoverage(P, coverage);
}

function printCoverage(P, coverage) {
  P("");
  P("## Page coverage (latest version, all groups)");
  if (!coverage.checked) {
    P(`- Could not read docs.json: ${coverage.error}`);
  } else if (coverage.missing.length) {
    P(`- **${coverage.missing.length} page(s) have no SCOPE_MAP entry and aren't on the review list:** ${coverage.missing.join(", ")}`);
  } else {
    P("- Every page has a SCOPE_MAP entry or is on the review-every-release list.");
  }
}

// Reads docs.json and confirms every page of the latest version is routed by a
// SCOPE_MAP entry or listed in REVIEW_EACH_RELEASE, so a newly added page can't
// silently go unmonitored the way installation.mdx, components/widget.mdx,
// components/theming.mdx, guides/events.mdx, and playground.mdx previously did.
async function checkPageCoverage() {
  try {
    const data = JSON.parse(await readFile(path.join(REPO_ROOT, "docs.json"), "utf8"));
    const flatten = (items) => items.flatMap((p) => (typeof p === "string" ? [p] : flatten(p.pages ?? [])));
    // Only the latest version is maintained; older versions are frozen snapshots.
    const groups = data.navigation?.versions?.[0]?.groups ?? data.navigation?.pages ?? [];
    const pages = flatten(groups);
    const mapped = new Set([
      ...SCOPE_MAP.flatMap((e) => e.pages.split(",").map((p) => p.trim().replace(/\.mdx?$/, ""))),
      ...REVIEW_EACH_RELEASE,
    ]);
    return { checked: true, missing: pages.filter((p) => !mapped.has(p)) };
  } catch (e) {
    return { checked: false, missing: [], error: String(e) };
  }
}

const stripPrefix = (s) => s.replace(/^(\w+)(\([^)]+\))?(!)?:\s*/, "").replace(/\s*\(#\d+\)\s*$/, "");

main().catch((e) => { console.error(e); process.exit(1); });
