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

There are three Vercel Node functions (`api/session.js`, `api/school.js`, `api/practice.js`). The project has ten JavaScript files in total, including libraries, browser modules and tests.

## Practice sets

The new practice bank is independent of the 2562–2563 source references and self-recorded study status. Set 1 has one newly authored five-choice question per topic: ENG 38, MATH 67, SCI 77, THAI 39, SOC 40 (261 total). The schema supports sets 1–10; only set 1 is supplied initially.

Run the separately delivered **private** `School_Practice_Set1.sql` in School's Supabase SQL Editor after the original catalog SQL. Its five verification rows must have `passed = true`. It installs the schema and the full question bank in one transaction. Rerunning retains existing questions, answers and grading history. `supabase/School_Practice_schema.sql` contains only the schema and cannot install questions by itself. Before installation, the original catalog stays usable and the practice panel shows preparation pending.

**Keep the full seed SQL and teacher JSON out of this public repository and out of `public/`.** They contain the real answer keys, explanations and reasoning. No new environment variable is needed. The browser uses only the authenticated School API; Supabase anon/authenticated roles have no practice table or RPC access. The backend service role can read the new tables; writes use restricted database transactions.

Students choose an answer in the popup; the server saves it before showing a green answered state. They can go back, skip, close and resume a draft. Confirming advances within the same subject. A subject can be submitted only after every topic is answered; submission locks its answers. A manager presses **ตรวจและเปิดผล**, which checks all answers and publishes scores and solutions atomically. Teachers can preview the answer key and worked explanation from the start; teachers without manage permission cannot grade. Current School and Temple membership are rechecked on every protected request.

The dashboard shows the member's overall accuracy for the selected set, five subject results, topic accuracy across graded sets, and (when more sets are active) a per-set comparison. Overall accuracy is total correct divided by total graded questions. Ungraded subjects contribute neither a score nor a zero. Set 1 gives a topic result of 0% or 100%; additional graded sets accumulate that topic's percentage. The first release keeps one attempt per member, subject and set; it does not implement retakes.

The API tests cover cookie ownership, teacher/student/manager boundaries, result privacy before release, grading identity, CSRF, revocation, schema setup and future-set pagination with synthetic content. The actual seed was separately checked in PostgreSQL through PGlite: all 261 keys, five subject submissions, locks, incomplete submission, database privileges, role changes, repeated install and preservation of 440 source records. No real member or production database data is used in those tests. Practice questions use text; no new media upload or Supabase Storage bucket is created.

## Bridge diagnostics

`GET /api/school?route=health` verifies database access and the columns of the two bridge tables using `limit=0`, then checks the signed membership endpoint at `https://watt.nathoeng.com` with a fixed sentinel ID. It returns readiness or a safe error category without returning member rows. It cannot import members or grant permissions. Database failures log only the table, HTTP method/status and PostgREST error code; keys and member data are never logged.

Opaque Supabase secret keys use the `apikey` header. Legacy service-role JWTs additionally use the Bearer header. A missing-schema error means the SQL must be run in the project selected by School's `SUPABASE_URL`; successful SQL verification in a different project does not prepare School's configured database.

`SUPABASE_URL` can be the Project URL or a copied HTTPS Data API URL ending in `/rest/v1` (or a table path below it). The server normalizes that path and removes copied query parameters before adding its own table route, preventing duplicated `/rest/v1` paths and `PGRST125` errors.

Temple membership checks and member-portal links use `watt.nathoeng.com`, the domain attached to the `nathoeng-temple` project. The apex `nathoeng.com` redirects to a different site and must not be used for this server callback. Central media storage remains `media.nathoeng.com`; member transfer itself contains no media uploads.
