# D2 local restore and immutable rollback

**LOCAL LOGICAL REHEARSAL PASS, 2026-09-11 UTC. Public release remains NO-GO.**
Hosted backups/PITR, production RPO≤24h/RTO≤4h, provider/OAuth/environment recovery,
external monitor alerts and Vercel deployment rollback are UNVERIFIED.
Source `332f704a37abb7475fc250c2b3c9466440107c76`, Node22.23.1,
Supabase CLI2.109.1. This procedure uses the owned source `albalmon-ca-launch`
(API55321/DB55322) and separately disposable `albalmon-ca-restore-drill`
(API56321/DB56322). Original `k-work-us`543xx and native5432 were untouched.

## Repeatable local procedure

Use protected operator tooling; never print status JSON, connection credentials,
raw dumps, private row contents, headers or login tokens. Use `umask 077`, a fresh
`mktemp -d` directory outside the repository (mode700), mode600 dump/manifest/log
files and a finally/trap that disposes the exact owned target and export directory
on **every** exit. Do not pipe failed commands' raw diagnostics to public evidence.
No source reset, seed, historical migration rewrite or global setting change.

1. Assert source and original DB containers healthy. Assert target containers,
   volumes and listeners on every port56321–56329 are absent; abort if any exist.
   Record source `git rev-parse HEAD`, exact ordered migration versions (21 here)
   versus `supabase/migrations`, and `docker inspect` image plus image ID. Both
   source and new target must match:
   `public.ecr.aws/supabase/postgres:15.8.1.085`,
   `sha256:af083ef64d0408c8f098ee6f5c364a59b26f36fbc0f3a334a62c5c1d57362e9b`.
2. Copy source `supabase/config.toml` into the disposable directory's `supabase/`;
   change only project ID to `albalmon-ca-restore-drill`, 5532x ports to5632x,
   `[db.seed] enabled=false`, and `[analytics] enabled=false`. Copy no migrations
   for initial `supabase db start --workdir "$DRILL_ROOT"`. Keep source Auth
   configuration unchanged in this copy. Analytics disabling is a local port
   collision workaround, not analytics recovery evidence.
3. Create one disposable local password Auth account using credentials held only
   in memory; actually sign in and call current `acknowledge_policies`. Keep its
   exact ID for cleanup and its credentials in memory for target login. Capture
   [restore-verification.sql](restore-verification.sql) output privately from the
   source and retain a separate full public/Auth row-hash snapshot. Freeze writes
   during backup; assert source row hashes and Git HEAD unchanged afterward.
4. From the source worktree, capture these five dumps. `$BACKUP_DIR` is inside the
   protected disposable directory; it is not a repository or public artifact:

   ```sh
   supabase db dump --local --role-only --file "$BACKUP_DIR/roles.sql"
   supabase db dump --local --file "$BACKUP_DIR/schema.sql"
   supabase db dump --local --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes --file "$BACKUP_DIR/data.sql"
   supabase db dump --local --schema supabase_migrations --file "$BACKUP_DIR/history-schema.sql"
   supabase db dump --local --schema supabase_migrations --data-only --use-copy --file "$BACKUP_DIR/history-data.sql"
   ```

   Record only filenames, sizes, modes and SHA-256. The explicit vector metadata
   exclusions are CLI-managed storage objects, not application data exclusions.
   Separately export the actual `on_auth_user_created` trigger definition from
   `auth.users`. This is the app-owned managed-schema delta omitted by the normal
   schema dump. Assert its function is `handle_new_user()` and schema-qualify it
   as `public.handle_new_user()` before saving `managed-schema-delta.sql`.
   Assert no conflicting trigger exists in the empty target.
5. Start the target DB and assert its exact image again. Copy the protected dumps
   into target `/tmp/albalmon-restore/`. The actual schema dump contains source
   GRANT/default-ACL statements but does not revoke conflicting inherited target
   table grants. Before creating source objects, reset **only the empty owned
   target's** postgres/public defaults for the three API roles. Import with
   `ON_ERROR_STOP=1` and one transaction:

   ```sh
   docker exec supabase_db_albalmon-ca-restore-drill psql -U postgres -d postgres -X --single-transaction -v ON_ERROR_STOP=1 \
     -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon,authenticated,service_role;' \
     -f /tmp/albalmon-restore/roles.sql \
     -f /tmp/albalmon-restore/schema.sql \
     -f /tmp/albalmon-restore/managed-schema-delta.sql \
     -c 'SET session_replication_role = replica' \
     -f /tmp/albalmon-restore/data.sql
   docker exec supabase_db_albalmon-ca-restore-drill psql -U postgres -d postgres -X --single-transaction -v ON_ERROR_STOP=1 \
     -f /tmp/albalmon-restore/history-schema.sql \
     -f /tmp/albalmon-restore/history-data.sql
   ```

   Redirect output to protected logs. Preserve PostgreSQL owner and built-in
   PUBLIC/default semantics; do not revoke everything from every role. Source
   dump's final ALTER DEFAULT PRIVILEGES restores the exact source defaults,
   including source Dxt defaults that differ from existing source table grants.
6. Before target Auth starts, run the tracked SQL with the same psql options
   against source and target into separate mode600 files and require exact `cmp`
   equality. For example, from the source worktree:

   ```sh
   docker exec -i supabase_db_albalmon-ca-launch psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 < docs/launch-evidence/restore-verification.sql > "$BACKUP_DIR/source-manifest"
   docker exec -i supabase_db_albalmon-ca-restore-drill psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 < docs/launch-evidence/restore-verification.sql > "$BACKUP_DIR/target-manifest"
   cmp "$BACKUP_DIR/source-manifest" "$BACKUP_DIR/target-manifest"
   ```

   Require all 15 FK orphan counts zero, invalid indexes/unvalidated constraints/
   public base tables without RLS zero, and public listing count equal to
   `is_job_open`. ACL entries are canonicalized by role/grantor names, privilege
   and grant option, with proper NULL/default ACL semantics; no OID or serialized
   ACL ordering waiver. Functions include owner/body/security-definer/search_path/
   grants, relations include owner/RLS/ACL/options, history includes statements.
   Public/Auth data use exact sorted full-row JSON digests and counts (never raw
   rows). This SQL is for the measured local data size, not an unbounded hosted
   backup service or substitute for a consistent production snapshot.
7. Copy the **whole** `supabase/tests` directory, including `helpers`, to the
   target workdir. Assert exactly three occurrences of
   `host=supabase_db_albalmon-ca-launch` in the copied
   `database/abuse_controls_concurrency.test.sql`; replace only those three with
   `host=supabase_db_albalmon-ca-restore-drill`. Leave source files unchanged.
   Run `supabase test db --local --workdir "$DRILL_ROOT"`: require10files/498PASS.
8. `supabase stop --project-id albalmon-ca-restore-drill` preserves this owned
   target's volume; then `supabase start --workdir "$DRILL_ROOT" --exclude
   analytics,vector --yes` starts its copied Auth/API configuration. Require
   actual API URL56321 in memory. Use its local anon key to sign in with the
   original fixture password, verify `getUser()` returns the same UUID, then read
   the RLS-protected profile and verify exact current policy identity. Do not
   claim unchanged Auth row hashes after login: sessions/audit naturally change.
9. Finally remove only the exact source fixture and its owned audit dependencies;
   `supabase stop --project-id albalmon-ca-restore-drill --no-backup`, assert zero
   matching containers/volumes/listeners, and delete only the validated mkdtemp
   directory (including dumps copied into target storage). Prove its absence and
   both protected containers healthy. Never include fixture IDs or credentials
   in the durable report.

## Observed failures and remedy

Attempts1–2 failed closed importing the unqualified managed trigger after the
dump cleared search_path. The reviewed schema qualification above fixed this;
no historical migration changed. Attempts3–4 exposed a **real** relation ACL
mismatch: target template defaults added Dxt privileges for API roles absent from
source table ACLs. Canonical comparison confirmed this was not array ordering.
A bounded exact source ACL replay was tried, then replaced with the smaller
pre-import default reset after inspecting the actual complete source dump.
Final defaults and current effective grants both match; no comparison relaxed.

Attempt5's restored pgTAP failed because an external test-directory mount omitted
`../helpers`, and hardcoded source-host dblink connections failed DNS translation
inside the isolated target network **before connection or mutation**, as observed
at the time. The per-attempt JSON retains failure phase and cleanup flags; the
single protected diagnostic was later overwritten by a startup failure, so the
original DNS diagnostic is not retained. No full source byte-for-byte comparison
across attempt5 is claimed. Copying
helpers and the three exact target-only host substitutions fixed the runner.
Attempts6–7 passed database comparison/498SQL but full startup hit analytics host
port56327 collision. CLI `--exclude analytics,vector` alone did not prevent that
startup; disabling analytics in the disposable copied config fixed it. Every
failed attempt disposed its owned target, dumps and source fixture. No attempt
reset the source or connected dblink to the original/source database.

## Final restore measurements

| UTC event (2026-09-11) | Observation |
|---|---|
| 07:44:20.508 | Start and absence/source/image preflight |
| 07:44:22.553 | Real source Auth fixture and acknowledgement ready |
| 07:44:23.382 → 07:44:29.723 | Five protected dumps; 6.341s |
| 07:44:29.723 | Restore starts; backup just completed |
| 07:45:44.840 | Database import complete; 75.117s from restore start |
| 07:45:45.851 | All14 exact comparisons and15FK checks PASS |
| 07:45:47.843 | Restored10files/498SQL PASS |
| 07:46:23.793 | Actual restored Auth login/getUser/profile policy PASS; 114.070s |
| 07:46:35.901 | Source fixture, target containers/volumes and exports disposed; protected stacks healthy |

The backup was newly completed at restore start; no real source outage or data
loss was induced. These timings do **not** establish hosted RPO≤24h or RTO≤4h.
Auth configuration came from the local config and image. Managed Auth schema
version77 and data were preserved, including password identity/session/refresh
state. Actual Google console, SMTP/provider keys, JWT/key rotation, DNS, hosting
secrets and hosted backup/PITR coverage remain separate unverified recovery work.

Snapshot: profiles4/Authusers4 (baseline3 plus one fixture), companies3/jobs13/
publicjobs11, business audits12 (baseline11 plus acknowledgement), policy pointer1;
applications/messages/reports/access requests/outbox/receipts0. Auth identities,
sessions, refresh_tokens and mfa_amr_claims each1; mfa_factors0,
auth.audit_log_entries1441, auth.schema_migrations77. Other Auth tables were empty
but compared. Empty collections are not evidence of restoring nonempty OAuth/MFA
factors; the actual password login is a separate successful check.

Protected dump files were mode600 inside mode700 directories; all disposed.

| File | Bytes | SHA-256 |
|---|---:|---|
| roles.sql | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| schema.sql | 108373 | `7f6176724fb46e949f928e0f24076752a002ae3b743e1c35067f67757d7ffdf1` |
| data.sql | 549664 | `059026d22b759ce54780b2574849d913ec85910d3b3befb57c7bc9aac79a7d84` |
| history-schema.sql | 1193 | `07c5a61963c6f9b1a5ccb32061083ea5ec1d25b6b32f403c4c771fb35c963910` |
| history-data.sql | 129978 | `6f7dddfe3d066a3a56c9f534c422e6214c86178f7528e6c805fa602036dd0979` |

Exact comparison digests below are SHA-256 of canonical query output, not raw
row exports. Data rows are first summarized by count/sorted full-row MD5; all
source and target digests were equal before Auth startup.

| Scope | Source = target SHA-256 |
|---|---|
| schemaPrivileges | `72f16526394463a2b82ea858b015dbaf37147551c28efdbd33b07895fdfba1e5` |
| defaultPrivileges | `c25969753f0ca00454ea113e1bcbebb06510a91add037755354c6f99bd8d93a5` |
| roles | `b73536d3cd8b48bb32dde6f06fb747620aab71dfd65953ff0ad5ddbe03427c57` |
| extensions | `b0e7f52955b0182c53b4e6d8291546dea080cf342fc86e9ff911ff519afd8913` |
| history | `4636029a833be9a7bf0ae5e781d3536cb7e490d7413722427a35759de3689b98` |
| relations | `84b3adbd79cbd387ebfbc24a595dc2da69c8845f554d5dd1f886881fd16e95b2` |
| columns | `b5da60ce84aa2d77ce92fe0cfa7a8cd1ed6cbb069ce6c655ebf1d67f1308847e` |
| constraints | `6934f845b44289e1a63618926771743e8e1983e4f2708a69a8cbf6d6029dab40` |
| indexes | `b62e93cad1482a02b0fee5b022003c2baed5b0be44566cae267a7c9a4b58f37d` |
| functions | `6b5823241c8c8d3eb74562893df29c69e4c92d7b940d2015e61e631ecd885e5d` |
| policies | `1bfaae027f3314696253f912fb0b389e62cda79d308fe446458f681071b392c3` |
| triggers | `d5a2ce6efc4546cc469cc528ae1cc14fac68f62fe3dd7f71539da7b9caa2ef2d` |
| views | `55e58b23fffec43d0540a7a4eeedca7b2b250664a2a57f3e3a913e8050a603b1` |
| all-public-auth-data | `b735d08e6982128e51d49500bb1e2352c7102d7f1f9922d1d1ec840fbbf0cca1` |

## Exact immutable artifact rollback

All artifacts came from source `332f704a37abb7475fc250c2b3c9466440107c76` after
the current policy schema, with local public origin/API settings and no service
key in compiled files. The active identity before/after all steps was
`draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7`.
No reviewed-policy claim or pointer transition was made.

| Artifact actually served | Build ID | Archive SHA-256 |
|---|---|---|
| A: tested known-good candidate, restored after fault | `4VRQg6qIlBRw61B7BHQal` | `dd8fa8b2129e006124ac1b93c2df311de26cbc694e5e8aacb4e7c0ecc2f86913` |
| B: isolated simulated bad deployment from same source plus fault patch | `4I6otlT2D5Jwh99Z511V_` | `5c5c7a86921f5544b0ac92ede6e81f51a41c628d4843e7bb4dfc2305df561793` |
| Separate invalid-public-key diagnostic build | `W6vuNSjatJvBnLp29mla-` | `f95c519cbf6bc61879fe634d4c586dd8aff5e72b1a81f86db893957d9fd5a4f7` |

A has no fault patch. B was a separate copy/build: its root layout checked an
owned local `.d2-root-fault` file and threw a fixed error when present; copied
Next config set `turbopack.root` to resolve the existing node_modules link.
Combined injected layout/config file SHA-256:
`1860dbe0e7bee4459a4d0c16bec93933388a7bae33eabb64fc7eecad46ec8cb5`.
Invalid-key copy's injected source/config digest:
`efe9054f4f0c202feeae93e20067186e684cd1f17903ecf731b191b9e654388d`;
it compiled a deliberately invalid local public anon key. These modifications
never entered the candidate source tree.

Rehearsal 07:46:47.971–07:46:53.808 UTC:

1. Serve extracted A, establish real local owner/seeker sessions, and write via
   actual app UI: profile policy acknowledgements, company/job with posting
   acknowledgement, application and message. Approval for this narrow rehearsal
   used trusted fixture setup; the subsequent full browser suite independently
   exercised actual AAL2 admin approval. Record a hash of the retained history.
2. Stop A and actually serve distinct B with the root fault active. The same
   browser context encountered the real global error screen; database and policy
   pointer were retained.
3. At07:46:51.746 verify A archive hash, extract into a **new** rollback directory,
   start that extracted artifact without building, and reload history. Recovery
   at07:46:52.749: 1,003ms local switch. This is a simulated fault deployment
   rollback, not a preceding hosted release, Vercel rollback or restart of B.
4. Prior history hash remained exactly
   `522586908e9e96a80669f61d8349baeacf4fcaa4fed6da205cd1e786b70779c4`.
   Create a new message, edit/resubmit job with posting acknowledgement to pending,
   withdraw application, and read retained history successfully on restored A.
   Current policy identity stayed equal throughout. No reset or legal rollback.
5. Run the final whole browser suite on this same extracted A:27/27PASS21.9s.
   Five destination-stream warnings remain unresolved; see
   [release candidate](release-candidate.md). Inspect captured server logs in
   memory: private fixture markers/service key absent. Dispose exact fixtures,
   stop the owned3100 server and remove rehearsal archives/copies after digest
   recording and final verification. The tracked record retains identities;
   actual hosted immutable deployment retention is still unverified.

For a future real rollback, first select an actually tested immutable artifact
with the same **active reviewed** policy identity, verify its digest, retain the
current database/history, and prove these writes before promotion. Do not use
this local draft artifact as a public launch approval. Backup and code rollback
are different operations; cron/provider/environment recovery needs independent
checks in [operational health](../OPERATIONAL_HEALTH.md).

Final cleanup verification: no target containers/volumes remain; both protected
DB containers healthy. Source counts Auth/profiles/companies/jobs/publicjobs/
audits =3/3/3/13/11/11; applications/messages/reports/access requests/outbox/receipts
all0;21 migration entries. `git diff` against the D2 base for all `supabase/`
files is empty. Rehearsal artifact copies/archives and the remaining protected
diagnostic file were disposed after final browser verification.
