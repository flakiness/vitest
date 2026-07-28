# CLAUDE.md

## Project Overview

`@flakiness/vitest` is a custom Vitest reporter that converts Vitest test results into the [Flakiness Report](https://github.com/flakiness/flakiness-report) JSON format for [flakiness.io](https://flakiness.io). It captures test outcomes, suite hierarchy, error locations, retries, annotations, stdio, CPU/RAM telemetry, and environment metadata. Reports are written locally and optionally uploaded to flakiness.io.

The entire reporter is a single source file (`src/reporter.ts`) bundled to `lib/reporter.js`.

## Tech Stack

- **Language**: TypeScript (ESM; esbuild targets Node.js 20, and package/runtime requirements are defined in `package.json`)
- **Build**: [Kubik](https://github.com/flakiness/kubik) + esbuild (bundle) + tsc (declarations only)
- **Test framework**: Vitest 4.0+
- **Package manager**: pnpm (v11, pinned via `packageManager` in package.json)
- **Key dependencies**: `@flakiness/flakiness-report` (report schema types), `@flakiness/sdk` (git, upload, CPU/RAM utils)
- All dependencies are devDependencies — esbuild bundles them into `lib/reporter.js`, so the published package has zero runtime dependencies (only `vitest`/`@vitest/utils` are externalized)

## Common Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build (esbuild bundle + tsc declarations)
pnpm build -w         # Build in watch mode
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once (CI-style)
```

## Repository Structure

```
src/reporter.ts       # The entire reporter implementation (single file)
lib/                  # Build output (JS bundle + sourcemaps) — gitignored
types/                # Build output (declaration files) — gitignored
tests/
  utils.ts            # Test harness: generateFlakinessReport() spins up a temp vitest instance
  global-setup.ts     # Cleans artifact dir before test run
  *.test.ts           # Integration tests
build.mts             # Kubik build script (esbuild + tsc)
vitest.config.ts      # Project's own vitest config (dogfoods @flakiness/vitest)
README.md             # User-facing docs: all reporter options + FLAKINESS_* env vars
features.md           # Status table vs the Flakiness Report feature spec
CONTRIBUTING.md       # Build & release instructions
```

## Architecture Notes

- The public export is `FKVitestReporter` (default export from `src/reporter.ts`), which implements Vitest's `Reporter` interface.
- Internally, `FKVitestReporter` delegates to a `ReporterImpl` created per test run (supports watch mode re-runs).
- `ReporterImpl` walks Vitest's `TestModule` / `TestSuite` / `TestCase` tree and builds the FK report tree (`FK.Suite` / `FK.Test` with attempts).
- Duplicate test name detection is a key concern — Vitest allows duplicate names, but flakiness.io requires unique full names. Controlled via `duplicates` option (`'fail'` default, or `'rename'`); implemented by the `detectDuplicates` / `warnDuplicates` / `failDuplicates` / `renameDuplicates` functions.
- Attachments come from `testCase.artifacts()` and are collected by `_collectAttachments()`, which names each one and stores the bytes in `_attachments` (keyed by content id, so identical content is stored once) until `writeReport()`. Scope is deliberately **Browser Mode screenshots** — `internal:failureScreenshot` (`failure-screenshot.png`) and `internal:toMatchScreenshot` (`screenshot-N-expected/actual/diff.png`) — because they are the only attachments Vitest produces on its own; other artifact types fall through to a generic `<type>-<index>` name. `internal:annotation` artifacts are skipped: Vitest 4 reports annotations via `testCase.annotations()` instead, and `annotation.attachment` is intentionally not collected (no real-world usage). Vitest plans to report annotations as artifacts in its next major, so the skip must stay.
- Attachment naming cannot use `attachment.path`: Vitest copies attached files into its `attachmentsDir` under a hash of the source path. Artifacts that care keep the real path in `originalPath`.
- Vitest never clears `task.artifacts` between retries, so a test that failed several times carries one failure screenshot per failed attempt (named `failure-screenshot.png`, `failure-screenshot-2.png`, ...).
- Collecting attachments is IO-bound, so `_collectSuite` / `_collectTest` are async and the whole tree walk is awaited in `onTestRunEnd()` — before duplicate handling, which rewrites attempts.
- Vitest does not provide per-retry detail, so retries are synthesized: N-1 zero-duration failed attempts + 1 final attempt (errors/stdio/annotations/attachments duplicated across them). See https://github.com/vitest-dev/vitest/issues/10303
- Behavior is configurable via reporter options (`title`, `flakinessProject`, `endpoint`, `token`, `outputFolder`, `duplicates`, `disableUpload`) and matching `FLAKINESS_*` env vars; `FK_ENV_*` vars become environment metadata. All documented in README.md.
- Dogfooding gotcha: `vitest.config.ts` uses `@flakiness/vitest` from npm (pinned devDependency, currently one version behind), **not** the local `src/`. Local changes don't affect the project's own report until published.

## Documentation Upkeep

When changing reporter behavior, keep these in sync:
- **README.md** — options and env vars reference
- **features.md** — per-feature status against the [Flakiness Report spec](https://github.com/flakiness/flakiness-report/blob/main/features.md), including known gaps and upstream Vitest issues

## Testing

Tests are **integration tests** — each test calls `generateFlakinessReport(ctx, files, reporterOptions?)` which:
1. Creates a temp directory with test files
2. Initializes a git repo in it (reporter requires git)
3. Links this repo's `node_modules` into the temp project, so its files and config can import anything from here (e.g. a Browser Mode config importing `@vitest/browser-playwright`)
4. Starts a real Vitest instance with `startVitest()`
5. Runs the reporter against it with uploads disabled
6. Reads back and asserts on the generated report JSON

Tests configure the temp project by writing their own `vitest.config.ts` into `files` — there is no separate config parameter. Because the linked `node_modules` points back here, the harness overrides Vite's `cacheDir` to `<temp project>/.vite-cache` so concurrent runs don't share (and pollute) this repo's `node_modules/.vite`.

Tests use `/tmp/flakiness-vitest` (or `/private/tmp/flakiness-vitest` on macOS) for artifacts. The `global-setup.ts` wipes this directory before each full test run.

`attachments-browser.test.ts` covers attachments end to end. It is browser-only by design: Browser Mode is the only thing in Vitest that produces attachments without the test asking for them. Requires `pnpm exec playwright install chromium`.

Test timeout is 30 seconds (`vitest.config.ts`).

## CI

- Tests run on **ubuntu, macos, windows** via GitHub Actions (`.github/workflows/tests.yml`); same-repo runs upload the dogfooded report to flakiness.io via OIDC
- Fork PRs can't use OIDC, so `tests.yml` saves the report as an artifact and `flakiness-upload-fork-prs.yml` (a `workflow_run` trigger) uploads it from a privileged context
- Publishing to npm is triggered by GitHub Releases (`.github/workflows/publish-npm.yml`); pre-releases go to `@next` tag

## Release Process

1. `pnpm version minor` (or `pnpm version preminor --preid=alpha`)
2. `git push --follow-tags`
3. Create a GitHub Release for the tag — CI publishes to npm
