# Current upstream compatibility verification

Verified in an isolated Linux cloud profile on 2026-10-24. These identities describe evidence, not supported-version gates.

- Plugin baseline: `3f24fb81c6cdb7e20db96bb8f9075af1b472da9f`, with the uncommitted compatibility changes in this checkout; product release metadata remains `0.1.7`.
- Official upstream: `https://github.com/deepseek-ai/deepseek-harness`, current default branch `master` at `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` (independently resolved from remote HEAD).
- Official tracked source diff and untracked-source check: clean. Generated ignored build artifacts are not source patches.
- Built host SHA-256: `1e7af2d3398a8044fff97190b7307ad31c9333a9600b7b8e7a040d15160b4242`.
- Built client SHA-256: `fc56fcdddbe0dde4abb74ac13a3c0ce5d912b50664f5400693b39f2c12000ad1`.

## Verified

- `npm test`: 56 tests passed across 10 files. Current-only observation API, cancellation, wrong identity/cwd/membership, lease disposal and durable retry/reopen are covered.
- Regression sensitivity: the current-only observation test fails with `session-not-ready` when the original service implementation is substituted in a disposable copy; it passes with the fix.
- `npm run test:contract`: actual official SessionStore and inherited SessionQueryEngine observation implementation pass create/commit, repeat commit, disposal and journal reopen. This is not a mocked replacement for the official query API.
- `npm run build`: plugin build and emitted-declaration typecheck pass against the selected official checkout.
- `npm run verify:package`: source guard, package contents, dependency closure and plugin injection checks pass.
- `npm run test:http`: packed plugin installed using the real official CLI, authenticated readiness and rejection checks, actual session creation/binding, repeated commit, completed keyless-model turn and restart retention pass.
- Combined HTTP acceptance with built `kiokuko-dsh@0.2.22` archive (SHA-1 `69cb9aa110ff1eceebf10243e927ca153978e203`) passes. The real `/kioku-lisp enable-task` command enables development task mode; the model sees and invokes `lisp_status`. Durable tool result has `isError: false`, `state: TASK_READY`, `enabled: true`, within the same successfully completed turn as the response. These assertions also pass after restart. A second distinct chat is actually created and committed.
- No external model credentials or paid provider requests are used.

The combined check is reproducible with `DSH_TEST_KIOKUKO_TARBALL=/absolute/path/to/built-package.tgz npm run test:http`; it is opt-in rather than downloading an arbitrary Kiokuko release. See DEVELOPMENT.md for current-upstream setup.

## Limits

- Browser UI acceptance remains unverified in this environment. Chromium cannot create its required local IPC socket; the alternate elevated launch could not initialize. HTTP acceptance does not establish rendering or click-path correctness.
- The complete official aggregate build did not finish here: broad TypeScript compilation was killed by cloud resource limits. Required official declarations, client bundles, web shell and native addon were instead built in bounded stages from unchanged source. The Node installation lacked development headers; the native addon used official Node.js `node-api-headers@1.9.0` from npm with the official source and NAPI 8 compiler flags. No tracked official files were edited.
- The added GitHub workflow has not run remotely. It resolves the current official default branch afresh, records its actual revision, builds upstream and runs unit, actual-contract, HTTP and browser checks. It does not assert compatibility by an arbitrary revision or version allowlist.
- The user's installed runtime was not accessed or updated. No commit, push, publication or deployment was performed.
