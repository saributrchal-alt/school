import { COOKIE, BRIDGE_MS, SESSION_MS, AUDIENCE, verifyToken, signToken, findMember, templeStatus, requireMember, sameOrigin, fail, sendError } from '../lib/school.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const member = await requireMember(req);
      return res.status(200).json({ success: true, member });
    }
    if (req.method !== 'POST') fail('Method not allowed', 405);
    if (req.query?.route === 'logout') {
      sameOrigin(req);
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
      return res.status(200).json({ success: true });
    }
    if (!['https://nathoeng.com', 'https://www.nathoeng.com', 'https://watt.nathoeng.com'].includes(req.headers.origin)) fail('กรุณาเข้าจากเว็บไซต์สมาชิกวัด', 403);
    const session = verifyToken(req.body?.token, 'school-handoff', BRIDGE_MS);
    if (!session) fail('ลิงก์เข้า School หมดอายุ กรุณากดเข้าใหม่จากบัญชีสมาชิกวัด', 401);
    const member = await findMember(session.memberId);
    if (!member?.is_active || !(member.can_study || member.can_teach || member.can_manage)) fail('กรุณาให้ผู้ดูแลวัดมอบสิทธิ์ School จากรายการสมาชิกก่อน', 403);
    if (!(await templeStatus(session.memberId)).is_active) fail('บัญชีสมาชิกวัดนี้หยุดใช้งานแล้ว', 403);
    const now = Date.now();
    const token = signToken({ memberId: member.member_id, iat: now, exp: now + SESSION_MS }, 'school-session');
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`);
    res.setHeader('Location', '/');
    return res.status(303).end();
  } catch (error) { return sendError(res, error); }
}
