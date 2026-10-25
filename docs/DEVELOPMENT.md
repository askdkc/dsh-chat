# Development

Verify the plugin against the current, unmodified official DSH default branch. From this repository:

```sh
node scripts/prepare-latest-dsh.mjs
corepack enable
corepack prepare "$(node -p "require('./.upstream/package.json').packageManager")" --activate
(cd .upstream && pnpm install --frozen-lockfile && pnpm run build)
npm ci
npm test
npm run test:contract
npm run build
npm run verify:package
npm run test:http
(cd .upstream && pnpm --filter @deepseek-ai/dsh-web-frontend exec playwright install chromium --only-shell)
npm run test:integration
```

The setup resolves the official default branch when it runs and records the actual commit in `dsh-revision-evidence.json`. It explicitly sets `origin/HEAD` to that advertised branch after the shallow clone, including when Git omits the symbolic ref for `--branch` clones. The commit is evidence of what was tested, not a compatibility allowlist. Do not patch DSH to make the plugin work. The stock-source guard rejects tracked edits and untracked source files, while allowing ignored build artifacts. CI runs the same current-upstream acceptance workflow on pushes, pull requests, manual requests and a daily schedule.

The stock-source guard checks official origin, clean source and consistency with revision evidence when supplied. By itself it does not prove that an independently prepared checkout is the latest remote HEAD: absent fresh evidence, an older official ancestor can pass. Use `prepare-latest-dsh.mjs` with a fresh target to resolve current upstream, or independently verify and record remote HEAD for a manually prepared checkout.

Follow the selected upstream's Node and package-manager requirements. `DSH_UPSTREAM` can select an independently prepared official checkout; build, types, package verification and all browser drivers use that same target. `PLAYWRIGHT_BROWSERS_PATH` may select a browser install, but is not silently redirected to an older checkout. `DSH_TEST_BROWSER_EXECUTABLE` explicitly selects an existing system Chromium when required; record its version with test evidence. The test runner creates its own isolated DSH home and keyless model. `TMPDIR` can place disposable test data on a filesystem with sufficient free space. Screenshots and diagnostics remain in that test home, not fixed developer directories.

The browser acceptance suite verifies new-chat creation and the first streamed response, separate workspaces, locale behavior, interrupted creation, restart, grouping and history retention. Historical results in VERIFICATION.md describe only their recorded source identities and are not evidence that a newer upstream passed.

For a broken Corepack shim, pass an installed pnpm entry point as `DSH_PNPM_ENTRY`; no global configuration change is required.

## Upgrade scenarios

The integration runner packs this checkout into its temporary profile outside the repository. Supply a previous package tarball stored outside the checkout to exercise recovery from a prior installed version:

```sh
DSH_TEST_UPGRADE_FROM=/absolute/path/to/previous-version.tgz npm run test:integration
```

This reproduces a legacy writer-lock failure, installs the current package, verifies both installed bundles match the build, then creates a chat from an existing workspace selection. Use an actual legacy package with the old lock behavior, not the current package.

For an earlier build without grouping, use `DSH_TEST_GROUP_UPGRADE_FROM=/absolute/path/to/previous-without-grouping.tgz`. This creates conversations with the supplied package, installs this build and checks grouping, deletion, history and files across restart. Neither scenario changes a real user profile or publishes a package.

`test:http` verifies the packed plugin through a real CLI Host: authenticated creation, idempotent commit, a completed keyless-model turn, separate chat storage and restart retention. It does not replace the browser UI acceptance suite.

For a combined-package acceptance run, set `DSH_TEST_KIOKUKO_TARBALL` to an already built Kiokuko package and run `npm run test:http`. The isolated profile enables development Lisp task mode and uses the keyless test model to invoke `lisp_status`; the test requires a successful same-turn tool result, completed response and restart retention. No external provider credentials are used.
