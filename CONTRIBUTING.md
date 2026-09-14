# Contributing

## Prerequisites

- [pnpm](https://pnpm.io/) 11; pnpm installs the repository's Node.js runtime from `devEngines`

## Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/flakiness/vitest.git fk-vitest
cd fk-vitest
pnpm install
pnpm exec playwright install chromium
```

## Building

This project uses [Kubik](https://github.com/flakiness/kubik) as its build system. The build script is defined in `build.mts`.

To build:

```bash
pnpm build
```

To watch:

```bash
pnpm build -w
```

This will bundle the source with esbuild and generate TypeScript declarations.

## Testing

```bash
pnpm test:run
```

The reporter supports Vitest 4 and 5 with a single build. The repository develops against Vitest 4 on Node 20, the oldest pairing the reporter supports; CI also runs every test against Vitest 5, which requires Node 22.12+. To test against Vitest 5 locally, run the commands of the "Switch to Vitest 5" step in `.github/workflows/tests.yml`, then `pnpm build && pnpm test:run`. Afterwards, restore `package.json` and `pnpm-lock.yaml` and run `pnpm install`.

## Releasing

To release a new version:

1. Bump the version:

   ```bash
   # For a stable minor release
   pnpm version minor

   # For an alpha pre-release
   pnpm version preminor --preid=alpha
   ```

2. Push the commit and tag:

   ```bash
   git push --follow-tags
   ```

3. [Create a GitHub Release](https://github.com/flakiness/vitest/releases/new) for the new tag and publish it.

   CI will handle publishing to npm. Pre-releases are published under @next tag.
