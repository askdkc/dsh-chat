# Development

Verify the plugin against the current, unmodified official DSH default branch. From this repository:

```sh
node scripts/prepare-latest-dsh.mjs
corepack enable
corepack prepare "$(node -p "require('./.upstream/package.json').packageManager")" --activate
(cd .upstream && pnpm install --frozen-lockfile && pnpm run build)
npm ci
(cd .upstream && pnpm --filter @deepseek-ai/dsh-web-frontend exec playwright install chromium --only-shell)
npm run test:ci
```

`test:ci` is the shared local/CI acceptance entry point. It runs unit tests, the native observation contract, build (including host/client typechecking), package verification, packing, clean consumer installation, HTTP acceptance, the published 0.1.9 negative control, recovery of a pending creation after upgrading from 0.1.9, and the complete browser suite. Push only after this command passes on the final changes; `npm test` alone does not exercise the browser rename/delete regression. Upstream and browser installation are prerequisites; Linux CI installs browser system dependencies with `--with-deps`.

Each invocation creates `.test-tmp/ci/run-*/`, records each executed check in `checks.json`, and packs one candidate into its `release/` directory. All normal acceptance checks consume that exact candidate. Repeated invocations preserve previous candidates and results. Inherited candidate, negative-control and upgrade settings are cleared; the legacy-failure flag applies only to the explicit negative-control check. A failed check stops the run immediately without retrying tests. This command creates a verification candidate; the separately authorized release procedure below remains available for publication.

CI uses Ubuntu 24.04 explicitly, cancels superseded runs for the same event/ref, and retries browser dependency installation at most three times. It retains check results, candidate manifests/archives and screenshots even after failure. Test profiles and authentication state are not uploaded. Integration homes and separate `host-N.log` files for each restart remain available locally under the run directory.

The setup resolves the official default branch when it runs and records the actual commit in `dsh-revision-evidence.json`. It explicitly sets `origin/HEAD` to that advertised branch after the shallow clone, including when Git omits the symbolic ref for `--branch` clones. The commit is evidence of what was tested, not a compatibility allowlist. Do not patch DSH to make the plugin work. The stock-source guard rejects tracked edits and untracked source files, while allowing ignored build artifacts. CI runs the same current-upstream acceptance workflow on pushes, pull requests, manual requests and a daily schedule.

The stock-source guard checks official origin, clean source and consistency with revision evidence when supplied. By itself it does not prove that an independently prepared checkout is the latest remote HEAD: absent fresh evidence, an older official ancestor can pass. Use `prepare-latest-dsh.mjs` with a fresh target to resolve current upstream, or independently verify and record remote HEAD for a manually prepared checkout.

Follow the selected upstream's Node and package-manager requirements. `DSH_UPSTREAM` can select an independently prepared official checkout; build, types, package verification and all browser drivers use that same target. `PLAYWRIGHT_BROWSERS_PATH` may select a browser install, but is not silently redirected to an older checkout. `DSH_TEST_BROWSER_EXECUTABLE` explicitly selects an existing system Chromium when required; record its version with test evidence. The test runner creates its own isolated DSH home and keyless model. `TMPDIR` can place disposable test data on a filesystem with sufficient free space. Screenshots and diagnostics remain in that test home, not fixed developer directories.

The browser acceptance suite verifies new-chat creation and the first streamed response, separate workspaces, locale behavior, interrupted creation, restart, grouping and history retention. Historical results in VERIFICATION.md describe only their recorded source identities and are not evidence that a newer upstream passed.

For a broken Corepack shim, pass an installed pnpm entry point as `DSH_PNPM_ENTRY`; no global configuration change is required.

## Upgrade scenarios

`DSH_TEST_CREATION_UPGRADE_FROM=/absolute/path/published-0.1.9.tgz npm run test:http` reproduces the old `session-not-ready` failure, updates that same isolated profile with `DSH_TEST_TARBALL`, retries the original request/session/workspace, and verifies a completed response and restart retention. `test:ci` includes this scenario automatically. A new-install pass alone does not establish recovery for an existing user.

The integration runner consumes `DSH_TEST_TARBALL` without repacking. Supply a previous package tarball stored outside the checkout to exercise recovery from a prior installed version:

```sh
DSH_TEST_UPGRADE_FROM=/absolute/path/to/previous-version.tgz npm run test:integration
```

This reproduces a legacy writer-lock failure, installs the current package, verifies both installed bundles match the build, then creates a chat from an existing workspace selection. Use an actual legacy package with the old lock behavior, not the current package.

For an earlier build without grouping, use `DSH_TEST_GROUP_UPGRADE_FROM=/absolute/path/to/previous-without-grouping.tgz`. This creates conversations with the supplied package, installs this build and checks grouping, deletion, history and files across restart. Neither scenario changes a real user profile or publishes a package.

`test:http` verifies the packed plugin through a real CLI Host: authenticated creation, idempotent commit, a completed keyless-model turn, separate chat storage and restart retention. It does not replace the browser UI acceptance suite.

For a combined-package acceptance run, set `DSH_TEST_KIOKUKO_TARBALL` to an already built Kiokuko package and run `npm run test:http`. The isolated profile enables development Lisp task mode and uses the keyless test model to invoke `lisp_status`; the test requires a successful same-turn tool result, completed response and restart retention. No external provider credentials are used.

## Release candidate 0.1.10

Baseline: dsh-chat `178468ca2d05a3fbb03b39dfa6bc50c95debf9b7`, official DSH `e8f7b93a344964de3dca1ace9e72b6e4d6de87cb` (`0.2.2-rc.2`). The existing SessionQuery observation implementation is retained; no additional compatibility branch is needed.

`build` removes all generated `lib` output before compiling host, browser and declarations. `prepack` and `prepublishOnly` reject missing or empty export targets without building them. There is no `prepare` or consumer install build hook. `npm test` includes a disposable-package regression that removes each required artifact and checks rejection through both lifecycle entry points.

Generate the candidate exactly once with `pack:release`. The command refuses to overwrite an existing candidate and records its content list, SHA-256, npm integrity, source hashes and upstream identity beside the archive in `.test-tmp/release/0.1.10/`. Use that same archive for clean `--ignore-scripts` consumer installation, HTTP and browser acceptance, and (only after separate authorization) publication. Never publish the working directory in place of the tested archive. The DSH integration profile also installs with scripts disabled and never changes existing user profiles or build-permission policies.

To demonstrate sensitivity against the published regression, download the registry's `0.1.9` archive to a separate directory and run:

```sh
DSH_TEST_TARBALL=/absolute/path/published-0.1.9.tgz DSH_TEST_EXPECT_LEGACY_FAILURE=1 npm run test:http
```

This negative control passes only when the same real CLI create/commit path returns `session-not-ready`; it is not a successful chat acceptance run. Normal acceptance must pass without that flag.

After publication is separately authorized, download the exact published version from npm, compare its registry integrity and archive SHA-256 with the candidate manifest, and repeat the consumer, HTTP and browser commands using that downloaded file. Publication and post-publication verification are not implied by local results.

An existing profile's `ERR_PNPM_IGNORED_BUILDS` for Git-sourced `dsh-codex` concerns that dependency's `prepare`, not dsh-chat. Diagnose and authorize any package-specific build separately; do not approve every dependency or claim this release fixes that issue.
