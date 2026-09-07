# Recovery without deleting chat data

A request record identifies a fixed request UUID, scope UUID, Session ID, phase and (once prepared) Workspace ID/canonical cwd. Do not change these IDs to force a retry. Use the UI's Retry on the original tab; reload restores that pending intent but does not send it automatically.

`allocated` permits resuming directory/Workspace preparation at the original location. `prepared` or `committed` requires the recorded Workspace and cwd to exist. Missing records, missing directories or removed registrations need operator review; the plugin never edits Session JSONL or re-registers a prepared Workspace to hide the discrepancy. Keep the journal, any `.tmp` residue, directories and DSH history before diagnosis.

The single-writer lock contains the owning process PID and a random token. An existing lock is never stolen, including after a crash. Stop all processes sharing the home, verify their identities, and move only the lock directory to a unique preserved sibling before starting one Host. PID liveness alone is insufficient because operating systems reuse PIDs. A malformed lock is also preserved for review. Never remove `chat/state/owner.json`, the request journal or a workspace as an unlock operation.

If tab sessionStorage is corrupted, preserve its `dsh.regular-chat.intent.v1` value and compare it with Host journals before clearing it in browser developer tools. If the connected scope changed, reconnect to the original Host/home to resume the request. Clearing pending state is an explicit abandonment of its UI recovery handle, not proof that the Host did no work.
