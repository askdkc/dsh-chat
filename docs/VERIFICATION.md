# Verification record — plugin-only 0.1.1

Target: unmodified DeepSeek Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215` (source version `0.1.3-alpha.1`). Platform: macOS arm64, Node 26.5.0, pnpm 11.7.0, Playwright Chromium. DSH was rebuilt after removing the former Hero-actions patch. `verify-stock-dsh.mjs` compares the tracked source tree with the pinned upstream commit before package and integration checks.

| Check | Result |
| --- | --- |
| Stock DSH source check and official build | Passed; no tracked DSH source changes, 222 Client artifacts |
| Plugin Host / Client typecheck and build against stock declarations | Passed |
| Unit tests | 43 passed across 10 files: persistent creation/retry/recovery, navigation, language ownership, button states, directory capability handling, killed-writer recovery initialization retries, owned Workspace grouping and persistent group naming |
| Package verification | Passed: shared React, expected exports, no Host code in the browser, no dependency on the former Hero-actions slot, no DSH source patch in the payload |
| Install the local implementation tarball through the standard DSH CLI | Passed in a temporary DSH_HOME, including upgrade from the earlier local build with existing per-chat Workspaces |
| Prior local-build existing-project upgrade regression | Three ordinary project Workspaces registered before any regular chat; selected one, reproduced the earlier development build’s stale-lock error, installed the lock-recovery build, then created a dedicated chat and streamed a response |
| Earlier local build to current grouping build | Existing per-chat Workspaces appeared in one Regular Chat sidebar group; history remained accessible |
| Sidebar group actions | Rename persisted, group + created an independent cwd, ordinary Add/Delete still worked |
| Group deletion | Native workspace/delete requests succeeded for the group members; history moved to Ungrouped, directories and result.md files remained after reload and Host restart |
| Delivered build identity | Both installed Host/Client JS files matched the current build; the actual browser response contained the complete new Client bundle |
| HTTP authentication / Host / Origin rejection | Passed; rejected calls created no request records |
| Central Regular Chat with zero Workspaces | Passed on stock DSH |
| English / Japanese / Chinese | Central action, standard bound Session, streamed test response and header action passed |
| Per-chat storage | Distinct cwd values and independent result.md files verified |
| 390px viewport and language switching | Localized errors and retry worked; request ID preserved; live locale changes created no extra request |
| Existing Workspace selection | Current selection, switching, arrow/Home/End navigation, Escape, focus return and cancellation passed |
| Regular Chat with an existing project selected | Dedicated Workspace ID and actual Session cwd passed commit verification; standard chat streamed a response, and the fixture marker was isolated from the selected project |
| Host directory browsing | Actual Host list, hidden-folder filtering, folder creation and Workspace adoption passed in test-owned directories |
| Failed directory read | Injected denial showed an error, recovered on retry and did not launch a native chooser |
| Native picker capability | Explicit native response switched to the native RPC; simulated cancellation and selection passed |
| Restart | Standard conversation history and generated files remained accessible |
| Abrupt Host exit | Real CLI Host killed with SIGKILL; restart recovered the retained writer lock without changing storage identity, preserved history, and created a new chat with an existing project selected |
| Lock recovery boundaries | One winner among 12 concurrent contenders; live writer, foreign hostname, denied process check, interrupted recovery and corrupt lock refused; legacy lock format recovered |
| Disable and uninstall | Standard Workspace menu and Add workspace affordance returned; chat controls disappeared; histories and files remained accessible |
| Browser JavaScript errors | None in the completed flows |

The table includes the complete successful implementation run before the release-version correction. Run the same suite with `npm run test:integration`. The runner checks stock DSH, installs the actual tarball, creates a temporary profile, uses a deterministic local model, exercises SIGKILL/restart, and stops its own Host on completion. The profile composes DSH's stock browse backend for directory tests. Native results and denied reads are simulated at the public RPC boundary; tests never open an OS dialog. Default directory reads are redirected to a test-owned folder. Neither the user's DSH profile nor personal folders are inspected or modified by these tests.

The release version is 0.1.1. This version-only correction was rebuilt and package-verified; integration tests were not rerun for this correction. On the preceding local build, the preserved-build replacement, grouping, deletion and history/file retention checks passed again. The subsequent full-suite run timed out at `scripts/browser-workspace-smoke.mjs:87` waiting for the selected `new-project` row; it did not complete, so the earlier full-suite pass must not be read as a new full-suite pass. These builds are local development artifacts; this verification did not publish to npm. The grouping upgrade used the preserved pre-grouping tarball and created its chats in an isolated test profile. The grouping-upgrade check used `DSH_TEST_GROUP_UPGRADE_FROM=/absolute/path/dsh-chat-before-grouping.tgz npm run test:integration`. Real user Workspaces, settings and conversations were not copied or modified. The earlier lock-recovery upgrade result above was verified with the previous local build. See [development](DEVELOPMENT.md) for build and browser prerequisites.

## Native chooser overlay correction (2026-09-08)

The local 0.1.2 build was installed into a fresh temporary DSH profile on the pinned stock source above. Both installed JavaScript bundles matched the local build. A focused run of `scripts/browser-native-picker-smoke.mjs` passed: no sidebar web dialog while capability detection or native selection is pending, cancellation and reopening, actual Workspace adoption of a test-owned directory, visible native failure recovery, Hero Add closing its dialog, actual Host browsing, and visible denied-listing errors. Native RPC outcomes were held and simulated; no OS chooser or personal directory was opened. Client unit tests passed (25 tests), as did typecheck, build and package verification. The full integration suite was not rerun; its runner now includes the new browser regression.

## Limits

The reported real-profile `workspace/delete ... Failed to fetch` has not been reproduced or established as fixed. The supplied server URL responded (HTTP 401 without authentication), and the authenticated browser loaded the existing sidebar. No real Workspace was deleted during diagnosis. Successful deletion in the isolated profile does not establish the cause of that transport failure.

Not independently tested: an actual OS-native chooser, live in-process plugin reload while a native chooser is pending, real model providers or credentials, model-driven shell writes, Linux/Windows, shared NFS, exhaustive abrupt-crash/power-loss behavior, or hostile same-user filesystem replacement. Test result.md files are written by the fixture into cwd values returned by the normal creation protocol.

The fixed-priority replacement preserves the stock picker registration underneath it. Another plugin replacing the same slot can prevent this plugin from winning; it does not escalate priority. Later Japanese language packs must respect DSH's existing language registration. These boundaries are described in [implementation](IMPLEMENTATION.md).
