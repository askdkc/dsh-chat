# Implementation decisions

The shipped design follows route A in PLAN.md: one generic, root-scoped Hero action list plus an external plugin. The core patch includes the owner type, render permission, runtime declaration, render location, wrapping layout, regression test, and regenerated catalog. No Host business behavior is added to DSH.

## Corrections to the plan verified against the pinned source

1. **Connection permits only one `/api` interceptor.** The built-in Gateway already owns it. A real Loader boot rejected a second interceptor. The plugin therefore registers four exact buffered POST routes through `connection.fetch.register()` under `/api/regular-chat/*`. Connection still performs authentication and Host/Origin checks before dispatch; the plugin validates the RPC envelope and echoes the caller-owned rpcId. The browser continues to use `connection.rpc.call('/api', ...)`. No parallel HTTP server, authentication system, private Gateway import, or second interceptor is introduced.
2. **The dictionary overload accepts only built-in en/zh.** Japanese uses the public single-language registration overload, with a separate owned catalog registration. The Client Connection is obtained with `ctx.get('connection')` and its public `ConnectionHandle` type; the Client package does not declare a `ctx.connection` property.
3. **The home-paths source version was unavailable from npm.** The Host build bundles the exact official pure resolver from the pinned checkout. The package does not request an unavailable runtime version. React remains in the DSH shared module table; Cordis is a peer, not a bundled second framework.

## Persistence boundaries

The request journal is persisted before allocating resources. `allocated` may resume idempotent Workspace registration at its original canonical path. `prepared` and `committed` must resolve the recorded Workspace ID and existing cwd; they never restore a deleted registration or recreate a missing cwd. Commit independently inspects the standard Session header and validates membership. Shutdown removes registered routes, drains admitted operations, and releases only its own writer lock. Chat data is never removed by the plugin.

The client saves intent before prepare, uses one coordinator across all surfaces, waits for both Workspace and membership snapshots, and opens only an addressable standard binding. A navigation generation detects moving away and back. RPC cancellation retains intent because it does not prove that the server made no changes. Standard `sessions.create()` has no cancellation parameter; its late completion cannot navigate after disposal.

## Scope of automatic checks

The browser integration fixture is a local deterministic LLM provider registered only in a test profile. It streams through the standard DSH agent, Session, history, Gateway and Conversation pipeline. It does not validate real provider credentials or contact a model API. Fixture files are excluded from the npm payload.

The tests establish macOS behavior and process-restart recovery. They do not prove power-loss durability, Windows permissions, NFS correctness, or adversarial same-user path-race resistance. Abrupt process-kill testing at every individual fsync/rename boundary remains separate from the injected failure tests.
