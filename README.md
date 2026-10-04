# Nathoeng School

School receives existing Temple members with the same member ID through the Temple → Account style HMAC bridge. No second registration or password database is created.

## Setup

1. Run `supabase/School_2562_2563.sql` in School's Supabase project. All verification rows should pass.
2. In the **School** Vercel project set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SCHOOL_BRIDGE_KEY`.
3. Set the **same** `SCHOOL_BRIDGE_KEY` in the **nathoeng-temple** Vercel project. Do not change `ACCOUNT_BRIDGE_KEY`.
4. Deploy both repos. School has no frontend build step or dependencies; Vercel framework preset is Other.
5. Temple admin opens a member → department assignment → School → selects study/teach/manage permissions → send. Grant the admin's own member School manage access for initial administration.
6. The member opens My Account → School. The signed 5-minute handoff is posted to School and becomes a 4-hour HttpOnly School session.

Generate the shared key once with `tools/New-SchoolBridgeKey.ps1`. Keep its value out of source code, browser scripts and logs. `SCHOOL_SESSION_SECRET` is optional; if provided only on School, it separately signs School sessions.

## Permissions

- Temple admin is checked against the current Temple member record before assignment.
- Destination receives only ID, name, permission flags and assignment metadata.
- A signed, timestamped server request imports or deactivates a member; the member ID is the upsert key. Older assignments cannot overwrite newer ones.
- Every protected School request rechecks School rights and the current Temple membership status. Revocation blocks existing sessions and retains learning history.
- Import events are recorded separately; repeated successful event IDs are idempotent. If event recording fails after the member update, the caller sees a failure and must retry; the latest permission state remains applied.
- The browser cannot access Supabase tables directly. Only the School server uses the Supabase secret.
- Students receive question references without answer keys. Only teach/manage members can see source answer keys.

The seeded content is a topic catalog and question references from the scanned source, not full question text or newly authored lessons. Study progress is self-recorded, not an independently assessed exam result.

## Tests

`npm test` exercises the sender, receiver, handoff, current permissions, stale/forged requests, revocation, source membership cancellation and student answer-key access using an in-memory REST fixture. No real member records are created by tests.

There are two Vercel Node functions (`api/session.js`, `api/school.js`), below the 12-function project limit.

## Bridge diagnostics

`GET /api/school?route=health` verifies database access and the columns of the two bridge tables using `limit=0`. It returns readiness or a safe error category without reading or returning member rows. It cannot import members or grant permissions. Database failures log only the table, HTTP method/status and PostgREST error code; keys and member data are never logged.

Opaque Supabase secret keys use the `apikey` header. Legacy service-role JWTs additionally use the Bearer header. A missing-schema error means the SQL must be run in the project selected by School's `SUPABASE_URL`; successful SQL verification in a different project does not prepare School's configured database.
