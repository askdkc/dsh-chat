# Development

Build against the pinned, unmodified DSH source tree. From this plugin repository:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .upstream
git -C .upstream checkout d347e703908d0406b7a7ef80e3a0e594d86b2215
(cd .upstream && pnpm install --frozen-lockfile && pnpm run build)
npm ci
npm test
npm run build
npm run verify:package
npm pack
npm run test:integration
```

Use Node.js 22.19+ (22.x) or 24+, and pnpm 11.7.0. Do not apply a DSH source patch. The package and integration checks reject a modified DSH source tree. Build output is local; these commands do not publish to npm.

The browser integration runner uses an isolated DSH home, a local test model, and Playwright Chromium. Install its browser once if needed:

```sh
(cd .upstream && PLAYWRIGHT_BROWSERS_PATH="$PWD/.regular-chat/browsers" pnpm --filter @deepseek-ai/dsh-web-frontend exec playwright install chromium --only-shell)
```

See [verification](VERIFICATION.md) for the tested scope. Production consumers install the built npm package and do not need this checkout.

To also verify the Session ownership/navigation API in DSH `0.1.6-alpha.2`, keep the original checkout and add an isolated stock worktree:

```sh
git -C .upstream fetch origin ddefc45fbc7f8e46dd73185e68295696d1297887
git -C .upstream worktree add --detach .regular-chat/alpha ddefc45fbc7f8e46dd73185e68295696d1297887
(cd .upstream/.regular-chat/alpha && pnpm install --frozen-lockfile && pnpm run build)
DSH_UPSTREAM=.upstream/.regular-chat/alpha npm run typecheck
npm run build
npm run verify:package
npm pack
DSH_UPSTREAM=.upstream/.regular-chat/alpha npm run test:integration
```

The same plugin bundle supports both pinned versions. `DSH_UPSTREAM` selects the type/build or integration target; the browser test driver still uses Playwright and its browser from the original `.upstream` setup. The stock-source guard accepts only the two pinned commits and rejects tracked source edits. For a broken Corepack shim, invoke the installed pnpm entry point directly and pass its absolute path as `DSH_PNPM_ENTRY` to the integration runner; no global configuration change is needed.

To test an upgrade, supply a tarball containing the previous version:

```sh
DSH_TEST_UPGRADE_FROM=/absolute/path/to/previous-version.tgz npm run test:integration
```

This registers three ordinary project Workspaces before any regular chat exists, selects one, kills and restarts the old Host to reproduce its stale-lock failure, then installs the current tarball into the same temporary profile. It compares both installed bundles with the build and verifies that the browser receives the new client code before creating a dedicated chat from the existing project selection. Use a legacy version with the old lock behavior for this regression scenario. No real user profile is modified.

For sidebar grouping upgrades from the earlier local build without grouping, preserve that tarball under a separate filename and use `DSH_TEST_GROUP_UPGRADE_FROM=/absolute/path/to/dsh-chat-before-grouping.tgz` instead. Do not point this at the current package. The runner creates conversations using the preserved build, installs the current package, and checks grouped browsing, deletion, history and files across restart.
