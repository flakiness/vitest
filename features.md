# Reporter Features — vitest

Status of [Flakiness Report Features](https://github.com/flakiness/flakiness-report/blob/main/features.md) as implemented by this
`@flakiness/vitest` reporter.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Report metadata | ✅ | `commitId`, `flakinessProject`, `url`, `configPath`, `startTimestamp`, `duration` all populated. `url` auto-detected via `CIUtils.runUrl()`. `configPath` comes from Vitest's resolved config. |
| 2 | Environment metadata | ✅ | `name`, `osName`, `osVersion`, `osArch` |
| 3 | Multiple environments | ✅ | One `environments[]` entry per Vitest project (project names must be unique in Vitest). |
| 4 | Custom environments (`FK_ENV_*`) | ✅ | Supports configuring custom environment properties via `FK_ENV_*` env variables. |
| 5 | Test hierarchy / suites | ✅ | Emits `file` and `suite` nodes with correct nesting. Vitest has no notion of anonymous suites, so that case doesn't apply. |
| 6 | Per-attempt reporting (retries) | ⚠️ | Vitest does not expose per-retry details. The reporter synthesizes `retryCount - 1` zero-duration failed attempts followed by the real final attempt. Errors, stdio, and annotations are duplicated across synthesized attempts. |
| 7 | Per-attempt timeout | ❌ | `RunAttempt.timeout` is not populated, even though Vitest exposes an effective `timeout` on the task. |
| 8 | Test steps | N/A | Vitest has no native step concept. |
| 9 | Expected status (`expectedStatus`) | ✅ | `test.fails()` / `options.fails` maps to `expectedStatus: 'failed'`; skipped/todo tests map to `expectedStatus: 'skipped'`. |
| 10 | Attachments | ❌ | Not implemented. Vitest 4 exposes `TestAttachment` on annotations and `TestArtifact`, but the reporter ignores them. |
| 11 | Step-level attachments | N/A | No steps. |
| 12 | Timed StdIO | ⚠️ | `TimedSTDIOEntry` with `dts` deltas is populated from `onUserConsoleLog`. Text only — Vitest does not expose binary (`buffer`) stdio. Per-attempt stdio is not split (same stdio copied to every synthesized attempt). |
| 13 | Annotations | ✅ | Emits native `testCase.annotations()` (type + description + location), plus synthesizes `skip` / `todo` (from `options.mode`), `fail` (from `options.fails`), and `dupe` (from duplicate-name handling). No `slow` / `owner` synthesis. |
| 14 | Tags | N/A | Vitest has no native tagging mechanism. |
| 15 | `parallelIndex` | ❌ | Not populated. Vitest runs tests across workers but the reporter does not thread worker identity through to attempts. |
| 16 | `FLAKINESS_TITLE` | ✅ | Honored; also settable via the `title` reporter option. |
| 17 | `FLAKINESS_OUTPUT_DIR` | ✅ | Honored; also settable via the `outputFolder` reporter option. Defaults to `flakiness-report`. |
| 18 | Sources | ✅ | Top-level `sources[]` populated via the SDK's `collectSources`. |
| 19 | Error snippets | ❌ | `ReportError.snippet` is not populated. Vitest produces formatted snippets during CLI output but does not surface them on the structured error object. |
| 20 | Errors support | ⚠️ | Multiple errors per attempt supported (soft assertions). `message`, `stack`, and parsed `location` (from the first in-test / non-`node_modules` stack frame) are populated. `value` for non-`Error` throws is not captured. |
| 21 | Unattributed errors | ✅ | Combines Vitest's `unhandledErrors` with per-module `errors()` into `report.unattributedErrors`. |
| 22 | Source locations | ✅ | Populated on tests, suites, errors, and annotations. No steps to annotate. |
| 23 | Auto-upload | ✅ | Supports GitHub OIDC (via `flakinessProject`), `FLAKINESS_ACCESS_TOKEN` (or `token` option), and `FLAKINESS_DISABLE_UPLOAD` (or `disableUpload` option) to opt out. |
| 24 | CPU / RAM telemetry | ✅ | Sampled every 1s via the SDK's `CPUUtilization` / `RAMUtilization`; `cpuAvg`, `cpuMax`, `ram`, `cpuCount`, `ramBytes` are enriched onto the report. |
