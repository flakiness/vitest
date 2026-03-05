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
  - [Duplicate Test Detection](#duplicate-test-detection)
  - [Environment Detection](#environment-detection)
  - [CI Integration](#ci-integration)
- [Configuration Options](#configuration-options)
  - [`flakinessProject?: string`](#flakinessproject-string)
  - [`endpoint?: string`](#endpoint-string)
  - [`token?: string`](#token-string)
  - [`outputFolder?: string`](#outputfolder-string)
  - [`open?: 'always' | 'never' | 'on-failure'`](#open-always--never--on-failure)
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

### Duplicate Test Detection

Vitest allows multiple tests to share the same name:

```typescript
it('should work', () => { /* ... */ });
it('should work', () => { /* ... */ });
```

Flakiness.io relies on full test names (all parent suite names + test name) to construct test history, so each test must have a unique full name. The reporter detects duplicates, issues warnings, and marks them as failed with a descriptive error message. Rename your tests to have unique full names to resolve this.

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

### `open?: 'always' | 'never' | 'on-failure'`

Controls when the report viewer should automatically open in your browser after test completion.

- **`'on-failure'`** (default): Opens the report only if tests failed and running in an interactive terminal (not in CI)
- **`'always'`**: Always opens the report after test completion (when running in an interactive terminal)
- **`'never'`**: Never automatically opens the report

```typescript
reporters: [
  ['@flakiness/vitest', { open: 'always' }]
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
        open: 'on-failure',
        disableUpload: false,
      }]
    ],
  },
});
```
