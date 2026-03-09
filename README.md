# Flakiness.io Vitest Reporter

A custom Vitest reporter that generates Flakiness Reports from your Vitest test runs. The reporter automatically converts Vitest test results into the standardized [Flakiness JSON format](https://github.com/flakiness/flakiness-report), capturing test outcomes, system utilization, and environment information.

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Uploading Reports](#uploading-reports)
- [Viewing Reports](#viewing-reports)
- [Features](#features)
  - [Test Location Tracking](#test-location-tracking)
  - [Handling Test Duplicates](#handling-test-duplicates)
  - [Environment Detection](#environment-detection)
  - [CI Integration](#ci-integration)
- [Configuration Options](#configuration-options)
  - [`flakinessProject?: string`](#flakinessproject-string)
  - [`endpoint?: string`](#endpoint-string)
  - [`token?: string`](#token-string)
  - [`outputFolder?: string`](#outputfolder-string)
  - [`duplicates?: 'fail' | 'rename'`](#duplicates-fail--rename)
  - [`disableUpload?: boolean`](#disableupload-boolean)
- [Environment Variables](#environment-variables)
- [Example Configuration](#example-configuration)

## Requirements

- Vitest 4.0 or higher
- Node.js project with a git repository (for commit information)
- Valid Flakiness.io access token (for uploads)

## Installation

```bash
npm install @flakiness/vitest
```

## Quick Start

Add the reporter to your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    includeTaskLocation: true,
    reporters: [
      'default',
      ['@flakiness/vitest', { flakinessProject: 'my-org/my-project' }]
    ],
  },
});
```

> [!NOTE]
> The flakiness reporter should be added alongside your other reporters. Include `'default'` (or another built-in reporter) to retain the standard terminal output, since Vitest only uses the reporters listed in the `reporters` array.

> [!TIP]
> Setting `includeTaskLocation: true` is recommended to enable test locations in the report.

Run your tests. The report will be automatically generated in the `./flakiness-report` folder:

```bash
npx vitest run
```

View the interactive report:

```bash
npx flakiness show ./flakiness-report
```

## Uploading Reports

Reports are automatically uploaded to Flakiness.io after test completion. Authentication can be done in two ways:

- **Access token**: Provide a token via the `token` option or the `FLAKINESS_ACCESS_TOKEN` environment variable.
- **GitHub OIDC**: When running in GitHub Actions, the reporter can authenticate using GitHub's OIDC token - no access token needed. This requires two conditions:
  1. The `flakinessProject` option must be set to your Flakiness.io project identifier (`org/project`).
  2. The Flakiness.io project must be bound to the GitHub repository that runs the GitHub Actions workflow.

If upload fails, the report is still available locally in the output folder.

## Viewing Reports

After test execution, you can view the report using:

```bash
npx flakiness show ./flakiness-report
```

## Features

### Test Location Tracking

When `includeTaskLocation: true` is set in your Vitest config, the reporter records the exact file, line, and column for each test. This enables precise navigation from the Flakiness.io dashboard back to your source code.

### Handling Test Duplicates

Vitest allows creating tests with identical names:

```typescript
// Trivial duplicates
it('should work', () => { /* ... */ });
it('should work', () => { /* ... */ });

// More common way to end up with test duplicates:
it.for([
  { input: 1, expected: 2 },
  { input: 1, expected: 3 },
])('should handle $input', ({ input, expected }) => { /* ... */ });
```

Flakiness.io, however, **does not allow** test duplicates.

Flakiness.io considers two tests to be *duplicates* when they:
1. Share the same parent suite hierarchy
2. Have the same test name
3. And run in the same Vitest project

Flakiness.io relies on full test names to construct test history, so each test must have a unique full name. When Vitest reporter detects tests with identical full names, it issues warnings and handles them according to the [`duplicates`](#duplicates-fail--rename) option.

### Environment Detection

For each Vitest project, the reporter creates a unique environment. If a project has a name, it will be used as the environment name in Flakiness.io. Tests run in different projects get separate history timelines.

Environment variables prefixed with `FK_ENV_` are automatically included in the environment metadata. The prefix is stripped and the key is converted to lowercase.

**Example:**

```bash
export FK_ENV_DEPLOYMENT=staging
export FK_ENV_REGION=us-east-1
```

This will result in the environment containing:
```json
{
  "metadata": {
    "deployment": "staging",
    "region": "us-east-1"
  }
}
```

Flakiness.io will create a dedicated history for tests executed in each unique environment. This means tests run with `FK_ENV_DEPLOYMENT=staging` will have a separate timeline from tests run with `FK_ENV_DEPLOYMENT=production`, allowing you to track flakiness patterns specific to each deployment environment.

### CI Integration

The reporter automatically detects CI environments and includes:
- CI run URLs (GitHub Actions, Azure DevOps, Jenkins, GitLab CI)
- Git commit information
- System environment data

## Configuration Options

The reporter accepts the following options:

### `flakinessProject?: string`

The Flakiness.io project identifier in `org/project` format. Used for GitHub OIDC authentication — when set, and the Flakiness.io project is bound to the GitHub repository running the workflow, the reporter authenticates uploads via GitHub Actions OIDC token with no access token required.

```typescript
reporters: [
  ['@flakiness/vitest', { flakinessProject: 'my-org/my-project' }]
]
```

### `endpoint?: string`

Custom Flakiness.io endpoint URL for uploading reports. Defaults to the `FLAKINESS_ENDPOINT` environment variable, or `https://flakiness.io` if not set.

Use this option to point to a custom or self-hosted Flakiness.io instance.

```typescript
reporters: [
  ['@flakiness/vitest', { endpoint: 'https://custom.flakiness.io' }]
]
```

### `token?: string`

Access token for authenticating with Flakiness.io when uploading reports. Defaults to the `FLAKINESS_ACCESS_TOKEN` environment variable.

If no token is provided, reporter will attempt to authenticate using Github OIDC.

```typescript
reporters: [
  ['@flakiness/vitest', { token: 'your-access-token' }]
]
```

### `outputFolder?: string`

Directory path where the Flakiness report will be written. Defaults to `flakiness-report` in the current working directory, or the `FLAKINESS_OUTPUT_DIR` environment variable if set.

```typescript
reporters: [
  ['@flakiness/vitest', { outputFolder: './test-results/flakiness' }]
]
```

### `duplicates?: 'fail' | 'rename'`

Controls how the reporter handles tests with duplicate full names. Defaults to `'fail'`.

> [!WARNING]
> The `'rename'` mode is **not recommended** for regular use. There is no guarantee that test histories will remain stable for duplicate tests, since the renaming is based on internal Vitest identifiers that may change between runs. This mode exists to help evaluate the reporter against large Vitest projects that have not yet resolved their duplicate test names.

- **`'fail'`** (default): Duplicate tests are marked as failed with a descriptive error message and a `dupe` annotation. The first duplicate gets a single failed attempt explaining the problem; the remaining duplicates are stripped of their attempts (effectively hidden from the report). This is the recommended mode — it surfaces the problem so you can fix it by renaming your tests.
- **`'rename'`**: Duplicate tests are automatically renamed by appending a suffix (e.g., ` – dupe #2`, ` – dupe #3`) to their titles. Each renamed test also receives a `dupe` annotation on all its attempts. The first test with a given name keeps its original title; only the subsequent duplicates are renamed.

```typescript
reporters: [
  ['@flakiness/vitest', { duplicates: 'rename' }]
]
```


### `disableUpload?: boolean`

When set to `true`, prevents uploading the report to Flakiness.io. The report is still generated locally. Can also be controlled via the `FLAKINESS_DISABLE_UPLOAD` environment variable.

```typescript
reporters: [
  ['@flakiness/vitest', { disableUpload: true }]
]
```

## Environment Variables

The reporter respects the following environment variables:

- **`FLAKINESS_ACCESS_TOKEN`**: Access token for Flakiness.io uploads (equivalent to `token` option)
- **`FLAKINESS_ENDPOINT`**: Custom Flakiness.io endpoint URL (equivalent to `endpoint` option)
- **`FLAKINESS_OUTPUT_DIR`**: Output directory for reports (equivalent to `outputFolder` option)
- **`FLAKINESS_DISABLE_UPLOAD`**: When set, disables report uploads (equivalent to `disableUpload` option)

## Example Configuration

Here's a complete example with all options:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    includeTaskLocation: true,
    reporters: [
      'default',
      ['@flakiness/vitest', {
        flakinessProject: 'my-org/my-project',
        endpoint: process.env.FLAKINESS_ENDPOINT,
        token: process.env.FLAKINESS_ACCESS_TOKEN,
        outputFolder: './flakiness-report',
        duplicates: 'fail',
        disableUpload: false,
      }]
    ],
  },
});
```
