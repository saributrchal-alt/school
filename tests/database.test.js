import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/school.js';
import school from '../api/school.js';

async function health(method = 'GET') {
  const result = { status: 200, body: null };
  const res = { setHeader() {}, status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await school({ method, query: { route: 'health' }, headers: {} }, res);
  return result;
}

test('database credentials and safe bridge readiness diagnostics', async t => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const names = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SCHOOL_BRIDGE_KEY'];
  const previousEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const logs = [];
  const requests = [];
  console.error = (...items) => logs.push(items.join(' '));
  process.env.SUPABASE_URL = ' https://school-db.invalid/\n';
  process.env.SUPABASE_SECRET_KEY = ' sb_secret_fixture_only\n';
  process.env.SCHOOL_BRIDGE_KEY = 'fixture_bridge_only';
  let reply = () => new Response('[]');
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return reply(url); };
  try {
    await t.test('opaque secret key uses apikey without an invalid Bearer token', async () => {
      await db('school_members?select=member_id&limit=0');
      assert.equal(requests.at(-1).url, 'https://school-db.invalid/rest/v1/school_members?select=member_id&limit=0');
      assert.equal(requests.at(-1).options.headers.apikey, 'sb_secret_fixture_only');
      assert.equal('Authorization' in requests.at(-1).options.headers, false);
    });
    await t.test('legacy service-role JWT keeps the Bearer header', async () => {
      process.env.SUPABASE_SECRET_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fixture_signature';
      await db('school_members?select=member_id&limit=0');
      assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer ' + process.env.SUPABASE_SECRET_KEY);
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_fixture_only';
    });
    await t.test('public readiness checks zero rows and never returns member data', async () => {
      requests.length = 0;
      reply = () => new Response(JSON.stringify([{ member_name: 'private fixture name' }]));
      const result = await health();
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { success: true, status: 'ready' });
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.equal(request.options.method, 'GET');
        assert.equal(new URL(request.url).searchParams.get('limit'), '0');
      }
      assert.equal(JSON.stringify(result).includes('private fixture name'), false);
      const before = requests.length;
      assert.equal((await health('POST')).status, 405);
      assert.equal(requests.length, before);
    });
    await t.test('missing bridge table is distinguished without revealing raw error text', async () => {
      reply = url => url.includes('school_member_bridge_events')
        ? new Response(JSON.stringify({ code: 'PGRST205', message: 'private fixture name sb_secret_fixture_only' }), { status: 404 })
        : new Response('[]');
      const result = await health();
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'school_schema_missing');
      assert.equal(result.body.table, 'school_member_bridge_events');
      assert.equal(result.body.db_status, 404);
      assert.equal(result.body.db_code, 'PGRST205');
      assert.equal(JSON.stringify(result).includes('sb_secret_fixture_only'), false);
      assert.equal(logs.join('\n').includes('private fixture name'), false);
      assert.equal(logs.join('\n').includes('sb_secret_fixture_only'), false);
    });
    await t.test('missing columns and database permissions have separate diagnoses', async () => {
      reply = () => new Response(JSON.stringify({ code: '42703' }), { status: 400 });
      assert.equal((await health()).body.code, 'school_columns_missing');
      reply = () => new Response(JSON.stringify({ code: '42501' }), { status: 403 });
      assert.equal((await health()).body.code, 'school_db_permission');
    });
    await t.test('invalid API key is diagnosed even when gateway returns non-JSON', async () => {
      reply = () => new Response('Unauthorized', { status: 401 });
      const result = await health();
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'school_db_key_invalid');
      assert.match(result.body.message, /SUPABASE_SECRET_KEY/);
    });
    await t.test('database conflicts retain 409 for existing import race handling', async () => {
      reply = () => new Response(JSON.stringify({ code: '23505' }), { status: 409 });
      await assert.rejects(db('school_members', 'POST', { member_id: 'fixture' }), error => error.status === 409);
    });
    await t.test('gateway endpoints and malformed API keys have actionable errors', async () => {
      reply = () => new Response('{"error":"Invalid API key"}', { status: 400 });
      assert.equal((await health()).body.code, 'school_db_key_invalid');
      reply = () => new Response('{"error":"Requested path is invalid"}', { status: 404 });
      const result = await health();
      assert.equal(result.body.code, 'school_db_endpoint_missing');
      assert.equal(result.body.db_status, 404);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    for (const name of names) if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name];
  }
});
