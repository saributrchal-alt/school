import crypto from 'node:crypto';

export const COOKIE = 'nathoeng_school_session';
export const AUDIENCE = 'school.nathoeng.com';
export const TEMPLE = 'https://watt.nathoeng.com';
export const BRIDGE_MS = 5 * 60 * 1000;
export const SESSION_MS = 4 * 60 * 60 * 1000;
export const MEMBER_FIELDS = 'member_id,member_name,can_study,can_teach,can_manage,is_active,assigned_by,assigned_at,updated_at';

function databaseFailure(path, method, status, result) {
  const table = path.split('?')[0];
  const code = typeof result?.code === 'string' && /^[A-Z0-9_]{1,24}$/.test(result.code) ? result.code : 'unknown';
  // Do not log request headers, keys, member data or database error text.
  console.error('[school-db]', JSON.stringify({ table: /^[a-z_]{1,64}$/.test(table) ? table : 'unknown', method, status, code }));
  let message = 'ฐานข้อมูล School ตอบกลับไม่สำเร็จ';
  let reason = 'school_db_unavailable';
  const hint = [result?.message, result?.error].filter(value => typeof value === 'string').join(' ');
  if (['PGRST205', '42P01'].includes(code)) {
    message = 'ยังไม่พบตาราง School ในฐานข้อมูลที่ตั้งค่าไว้ กรุณารัน SQL ในโครงการเดียวกับ SUPABASE_URL';
    reason = 'school_schema_missing';
  } else if (['PGRST204', '42703'].includes(code)) {
    message = 'โครงสร้างตาราง School ยังไม่ครบ กรุณาตรวจ SQL ของ School';
    reason = 'school_columns_missing';
  } else if (status === 401 || ['PGRST301', 'PGRST303'].includes(code) || /invalid api key/i.test(hint)) {
    message = 'คีย์ฐานข้อมูล School ไม่ถูกต้องหรือไม่ตรงกับโครงการ กรุณาตรวจ SUPABASE_SECRET_KEY';
    reason = 'school_db_key_invalid';
  } else if (status === 403 || code === '42501') {
    message = 'ฐานข้อมูล School ไม่อนุญาตให้ใช้งาน กรุณาตรวจคีย์และสิทธิ์ service_role';
    reason = 'school_db_permission';
  } else if (status === 404) {
    message = 'ไม่พบปลายทางฐานข้อมูล School กรุณาตรวจ SUPABASE_URL และสถานะโครงการ Supabase';
    reason = 'school_db_endpoint_missing';
  } else if (/project.+(?:paused|inactive)/i.test(hint)) {
    message = 'โครงการ Supabase ของ School หยุดทำงานอยู่ กรุณาเปิดใช้งานโครงการ';
    reason = 'school_db_paused';
  }
  const error = new Error(message);
  error.status = status === 409 ? 409 : 503;
  error.code = reason;
  error.dbStatus = status;
  error.dbCode = code;
  if (/^[a-z_]{1,64}$/.test(table)) error.table = table;
  throw error;
}

export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function bridgeKey() {
  const key = process.env.SCHOOL_BRIDGE_KEY;
  if (!key) fail('ยังไม่ได้ตั้งค่า SCHOOL_BRIDGE_KEY', 503);
  return key;
}

export function body(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { fail('ข้อมูลไม่ถูกต้อง'); }
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail('ข้อมูลไม่ถูกต้อง');
  return req.body;
}

export function signBridge(payload) {
  return crypto.createHmac('sha256', bridgeKey()).update(JSON.stringify(payload)).digest('hex');
}

export function verifyBridge(req, payload) {
  const signature = String(req.headers['x-school-signature'] || '');
  const expected = signBridge(payload);
  if (!/^[a-f0-9]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    fail('ไม่อนุญาตให้ส่งข้อมูลผ่าน bridge', 403);
  }
  const issued = Date.parse(payload.issued_at);
  if (!Number.isFinite(issued) || issued > Date.now() + 30_000 || Date.now() - issued > BRIDGE_MS) {
    fail('คำขอ bridge หมดอายุ', 403);
  }
}

export function memberId(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) fail('รหัสสมาชิกไม่ถูกต้อง');
  return value;
}

export function signToken(payload, purpose) {
  const key = purpose === 'school-session' ? (process.env.SCHOOL_SESSION_SECRET || bridgeKey()) : bridgeKey();
  const encoded = Buffer.from(JSON.stringify({ ...payload, purpose, aud: AUDIENCE })).toString('base64url');
  return encoded + '.' + crypto.createHmac('sha256', key).update(encoded).digest('base64url');
}

export function verifyToken(token, purpose, maxAge) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || parts[0].length > 2048 || !/^[\w-]{43}$/.test(parts[1])) return null;
  const key = purpose === 'school-session' ? (process.env.SCHOOL_SESSION_SECRET || bridgeKey()) : bridgeKey();
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (p.purpose !== purpose || p.aud !== AUDIENCE || !Number.isInteger(p.exp) || !Number.isInteger(p.iat)
        || p.exp <= Date.now() || p.iat > Date.now() + 30_000 || p.exp <= p.iat || p.exp - p.iat > maxAge) return null;
    memberId(p.memberId);
    return p;
  } catch { return null; }
}

export async function db(path, method = 'GET', payload, prefer = 'return=representation') {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) fail('ยังไม่ได้ตั้งค่าฐานข้อมูล School', 503);
  let endpoint;
  try {
    endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Invalid project URL');
    // Accept either Project URL or a copied Data API URL, including a table suffix.
    // Keep a proxy path prefix, but append /rest/v1 exactly once.
    endpoint.pathname = endpoint.pathname.replace(/\/rest\/v1(?:\/.*)?$/, '').replace(/\/+$/, '') + '/rest/v1/';
    endpoint.search = '';
    endpoint.hash = '';
  } catch { fail('SUPABASE_URL ของ School ไม่ถูกต้อง กรุณาใช้ Project URL ของ Supabase', 503); }
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: prefer };
  // Opaque sb_secret keys belong in apikey; legacy service_role JWTs also need Bearer.
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) headers.Authorization = 'Bearer ' + key;
  const response = await fetch(endpoint.toString() + path, {
    method, headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  let rows;
  try { rows = text ? JSON.parse(text) : []; }
  catch { if (response.ok) fail('อ่านข้อมูล School ไม่สำเร็จ', 503); }
  if (!response.ok) databaseFailure(path, method, response.status, rows);
  return rows;
}

export async function bridgeHealth() {
  bridgeKey();
  await Promise.all([
    db(`school_members?select=${MEMBER_FIELDS}&limit=0`),
    db('school_member_bridge_events?select=event_id,member_id,assigned_by,action,can_study,can_teach,can_manage,is_active,received_at&limit=0')
  ]);
  // A fixed sentinel checks the signed Temple endpoint without returning member data.
  await templeStatus('00000000-0000-4000-8000-000000000000');
}

export async function findMember(id) {
  return (await db(`school_members?member_id=eq.${encodeURIComponent(memberId(id))}&select=${MEMBER_FIELDS}&limit=1`))[0] || null;
}

export async function templeStatus(id) {
  const payload = { member_id: memberId(id), issued_at: new Date().toISOString() };
  const response = await fetch(TEMPLE + '/api/my-bookings?route=school-member-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-School-Signature': signBridge(payload) },
    body: JSON.stringify(payload), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000)
  });
  let result; try { result = await response.json(); } catch { fail('ตรวจสมาชิกวัดไม่สำเร็จ', 503); }
  if (!response.ok || !result?.success || typeof result.is_active !== 'boolean') fail('ตรวจสมาชิกวัดไม่สำเร็จ', 503);
  return result;
}

export async function requireMember(req) {
  const entry = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  let token; try { token = entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : ''; } catch { token = ''; }
  const session = verifyToken(token, 'school-session', SESSION_MS);
  if (!session) fail('กรุณาเข้า School จากบัญชีสมาชิกวัด', 401);
  const member = await findMember(session.memberId);
  if (!member?.is_active || !(member.can_study || member.can_teach || member.can_manage)) fail('สมาชิกยังไม่ได้รับสิทธิ์ School หรือถูกถอนสิทธิ์แล้ว', 403);
  const source = await templeStatus(session.memberId);
  if (!source.is_active) fail('บัญชีสมาชิกวัดนี้หยุดใช้งานแล้ว', 403);
  return member;
}

export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    const host = String(req.headers.host || '');
    if (origin.host === host && (origin.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && origin.hostname === 'localhost'))) return;
  } catch {}
  fail('ไม่อนุญาตให้ส่งคำขอจากเว็บไซต์อื่น', 403);
}

export function sendError(res, error) {
  return res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่',
    ...(error.code ? { code: error.code, table: error.table, db_status: error.dbStatus, db_code: error.dbCode } : {}) });
}
