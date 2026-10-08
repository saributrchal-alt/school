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

// Personal feedback after reviewing a released solution; independent of grading.
const UNDERSTANDING_FIELDS = 'track,mode,attempt_id,question_id,member_id,status,set_no,subject_id,topic_id,question_no,session_id,session_title,first_reviewed_at,updated_at';
function understandingMode(value) {
  if (!['practice', 'exam'].includes(value)) fail('โหมดทบทวนไม่ถูกต้อง');
  return value;
}
function understandingAttempt(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail('รายการทบทวนไม่ถูกต้อง');
  return value;
}
function understandingTrack(value) {
  if (!['military', 'alevel'].includes(value)) fail('หมวดทบทวนไม่ถูกต้อง');
  return value;
}

export async function understanding(member, query, track = 'military') {
  understandingTrack(track);
  const staff = Boolean(member.can_teach || member.can_manage);
  if (!staff && !member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์ทบทวน', 403);
  if (query.scope && !['mine', 'all'].includes(query.scope)) fail('ขอบเขตทบทวนไม่ถูกต้อง');
  if (query.scope === 'all' && !staff) fail('เฉพาะครูหรือผู้ดูแล School', 403);
  let filter = `track=eq.${track}`;
  const own = !staff || query.scope === 'mine';
  if (own) filter += `&member_id=eq.${encodeURIComponent(member.member_id)}`;
  if (query.attempt_id) {
    const mode = understandingMode(query.mode), id = understandingAttempt(query.attempt_id);
    const prefix = track === 'alevel' ? 'school_alevel' : 'school';
    const idField = mode === 'exam' ? 'exam_attempt_id' : 'attempt_id';
    const a = (await db(`${prefix}_${mode}_attempts?${idField}=eq.${id}&select=member_id,status&limit=1`))[0];
    if (!a || (!staff && a.member_id !== member.member_id) || (own && a.member_id !== member.member_id)) fail('ไม่พบรายการทบทวน', 404);
    if (a.status !== (mode === 'exam' ? 'submitted' : 'graded')) fail('ยังไม่เปิดทบทวนรายการนี้', 409);
    filter += `&mode=eq.${mode}&attempt_id=eq.${id}`;
  }
  try {
    const items = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const batch = await db(`school_question_understanding?${filter}&select=${UNDERSTANDING_FIELDS}&order=updated_at.desc,attempt_id.asc,question_id.asc&limit=1000&offset=${offset}`);
      items.push(...batch);
      if (batch.length < 1000) {
        const ids = [...new Set(items.map(x => memberId(x.member_id)))], names = new Map();
        for (let start = 0; start < ids.length; start += 100) {
          const rows = await db(`school_members?member_id=in.(${ids.slice(start, start + 100).map(encodeURIComponent).join(',')})&select=member_id,member_name&limit=100`);
          rows.forEach(m => names.set(m.member_id, m.member_name));
        }
        return { ready: true, can_review: staff && !own, items: items.map(x => ({ ...x, member_name: names.get(x.member_id) || 'สมาชิก School' })) };
      }
    }
    fail('รายการทบทวนมากเกินขอบเขต กรุณาให้ผู้ดูแลตรวจสอบ', 503);
  } catch (error) {
    if (error.code === 'school_schema_missing' && error.table === 'school_question_understanding') {
      return { ready: false, setup_required: true, items: [] };
    }
    throw error;
  }
}

export async function saveUnderstanding(member, payload, track = 'military') {
  understandingTrack(track);
  if (!member.can_study) fail('เฉพาะนักเรียนบันทึกความเข้าใจของตนเองได้', 403);
  const mode = understandingMode(payload.mode), id = understandingAttempt(payload.attempt_id);
  if (typeof payload.question_id !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(payload.question_id)
      || !['understood', 'needs_help'].includes(payload.status)) fail('สถานะความเข้าใจไม่ถูกต้อง');
  try {
    return await db('rpc/school_understanding_save', 'POST', {
      p_member_id: member.member_id, p_track: track, p_mode: mode,
      p_attempt_id: id, p_question_id: payload.question_id, p_status: payload.status
    });
  } catch (error) {
    const messages = {
      PT400: ['สถานะความเข้าใจไม่ถูกต้อง', 400], PT403: ['บัญชีนี้ไม่มีสิทธิ์บันทึกความเข้าใจ', 403],
      PT404: ['ไม่พบข้อสอบหรือรายการทบทวนของตนเอง', 404], PT409: ['บันทึกได้หลังส่งคำตอบและระบบเปิดเฉลยแล้ว', 409]
    };
    if (messages[error.dbCode]) fail(...messages[error.dbCode]);
    if (error.code === 'school_schema_missing' || ['PGRST202', '42883'].includes(error.dbCode)) {
      fail('ระบบบันทึกความเข้าใจยังไม่พร้อม กรุณาแจ้งครูหรือผู้ดูแล', 503);
    }
    throw error;
  }
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
