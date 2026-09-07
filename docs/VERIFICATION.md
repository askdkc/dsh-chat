# Verification record — 2026-09-07

Target: DeepSeek Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`, source version `0.1.3-alpha.1`, patched by route A. Platform: macOS arm64, Node 26.5.0, pnpm 11.7.0. Browser: Playwright Chromium headless shell 149.0.7827.55. No real model API was called and no package was published.

| Check | Result |
| --- | --- |
| Separate plugin Host / Client typecheck against built DSH declarations | Passed |
| Plugin unit tests: journals, duplicate/retried creation, restart, attach failure, removed resources, symlinks, permissions, ENOSPC, strict schemas, client navigation, subscriptions, language ownership and UI states | 29 tests passed across 6 files |
| DSH Conversation and Workspace suites | 40 files, 520 tests passed |
| DSH Host and Client library build/typecheck and Web build | Passed; official build recorded 222 Client artifacts |
| `gen-client-catalog` and `verify-client-catalog` | Passed; catalog generated, not manually edited |
| `verify-client-ui-i18n` | Passed; 488 Client UI source files checked |
| Patch applicability | Clean baseline application passed and reproduced all 7 tested files; reverse check also passed |
| `verify:package` and `npm pack` | Passed: required exports/files, exact bundle patch, closure factory, shared React, Host-import exclusion, dependency and credential-pattern checks |
| Real `dsh plugin --profile web add <tarball>` | Passed in fresh isolated DSH_HOME; Loader discovered Host and Client entries |
| Real HTTP trust/auth | Authenticated info succeeded; missing/invalid cookie returned 401; forged Host and Origin returned 403; no request records created by rejected calls |
| Workspace-zero central creation | Passed in the fresh integration home before any Workspace registration |
| en / ja / zh central action | All passed: dedicated Workspace, standard bound Session, editable composer, standard streamed response using test provider |
| en / ja / zh header action | All passed: New Regular Chat created a different cwd |
| File separation | Three `result.md` files independently retained their expected contents |
| Narrow 390px viewport | All three languages displayed localized storage errors and Retry preserved request ID; button stayed in viewport |
| Live language switching during a pending error | en → ja → zh → en updated the visible error without another prepare request |
| Browser JavaScript errors | None during successful creation/response/header flows |
| Restart | Standard Session list, response history in Web UI, and all three generated files survived |
| Plugin disable | The same standard history and files remained usable |
| Plugin uninstall | Official CLI removed plugin; the same standard history and files remained usable |

The complete install/browser/restart/disable/uninstall sequence is reproducible with `npm run test:integration`. Test homes are printed and retained for inspection; the runner stops only its own Host. Its local model fixture is excluded from the npm package.

## Issues found and resolved during verification

- PLAN's second `/api` interceptor caused real Loader activation to fail. The implementation now uses four authenticated exact Fetch routes; see [implementation decisions](IMPLEMENTATION.md).
- Node 26.5.0 with this machine's Corepack could not start pnpm (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). Running the specified pnpm entry directly, with a test-local shim for nested invocations, completed the official build. This is an environment issue, not a product patch.
- The local npm tried to enumerate a non-directory entry in the upstream workspace glob; `npm_config_workspaces=false` allowed the upstream scripts' nested npm commands to run.
- Browser smoke testing caught a build-adapter JSX issue before final packaging. The browser build explicitly uses automatic JSX and requests the shared `react/jsx-runtime`.
- Node's Fetch client did not send the forged Host as the test expected. The final trust test uses `node:http` for the Host-header case; the actual request returns 403.

## Limits of the evidence

Not run: real provider/credential integration; real shell/model-generated file writes; Windows or Linux; an exhaustive abrupt-crash/power-loss matrix at every fsync/rename instruction; shared NFS; hostile same-user filesystem replacement races. Tests wrote their `result.md` fixtures directly into the cwd proven by the normal creation protocol. Live model calls are not required to run the integration suite.

Directory-picker-disabled composition and native fork/New Session/subagent exceptions are source-confirmed, not an independent full browser matrix. The plugin has no direct directory-picker dependency, but it does not promise to repair other DSH features when their required dependencies are disabled. The standard picker regression suite passed.

Later third-party Japanese language packs must cooperate with DSH's single-registration catalog; this plugin preserves an existing registration and disposes only its own. It cannot prevent another plugin from unconditionally registering the same language ID.
