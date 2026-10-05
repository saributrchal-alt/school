import { body, requireMember, sameOrigin, fail, sendError, db } from '../lib/school.js';
import { summary, subject, reviewQueue, studentResults, transaction } from '../lib/practice.js';

async function migratePracticeMedia(setNo = 2) {
  const uploadKey = process.env.MEDIA_UPLOAD_KEY?.trim();
  if (!uploadKey) fail('ยังไม่ได้ตั้งค่า MEDIA_UPLOAD_KEY', 503);
  const rows = await db(`school_practice_questions?set_no=eq.${setNo}&question_image_url=like.data:image/*&select=question_id,question_no,question_image_url&order=question_no.asc`);
  const migrated = [];
  for (const row of rows) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row.question_image_url || '');
    if (!match) fail(`รูปข้อ ${row.question_no} ไม่ใช่ data URL ที่รองรับ`, 422);
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) fail(`รูปข้อ ${row.question_no} มีขนาดไม่ถูกต้อง`, 422);
    const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    const form = new FormData();
    form.append('folder', 'school');
    form.append('file', new Blob([bytes], { type: match[1] }), `set${setNo}-q${String(row.question_no).padStart(3, '0')}.${ext}`);
    const response = await fetch('https://media.nathoeng.com/upload.php', {
      method: 'POST', headers: { 'X-Upload-Key': uploadKey }, body: form,
      cache: 'no-store', signal: AbortSignal.timeout(20000)
    });
    let result; try { result = await response.json(); } catch { fail(`Media Server ตอบกลับไม่ถูกต้องที่ข้อ ${row.question_no}`, 502); }
    if (!response.ok || !result?.ok || typeof result.url !== 'string' || !result.url.startsWith('https://media.nathoeng.com/')) {
      fail(`อัปโหลดภาพข้อ ${row.question_no} ไม่สำเร็จ`, 502);
    }
    await db(`school_practice_questions?question_id=eq.${encodeURIComponent(row.question_id)}`, 'PATCH',
      { question_image_url: result.url }, 'return=minimal');
    migrated.push({ question_no: row.question_no, url: result.url });
  }
  return migrated;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const member = await requireMember(req);
    const route = req.query?.route || 'summary';
    if (req.method === 'GET') {
      if (route === 'summary') {
        try { return res.status(200).json({ success: true, ...await summary(member) }); }
        catch (error) {
          if (error.code === 'school_schema_missing' && error.table?.startsWith('school_practice_')) {
            return res.status(200).json({ success: true, ready: false, setup_required: true });
          }
          throw error;
        }
      }
      if (route === 'subject') return res.status(200).json({ success: true, ...await subject(member, req.query) });
      if (route === 'results') return res.status(200).json({ success: true, ...await studentResults(member, req.query) });
      if (route === 'review') {
        if (!member.can_manage) fail('เฉพาะผู้ดูแล School', 403);
        return res.status(200).json({ success: true, attempts: await reviewQueue() });
      }
      fail('ไม่พบรายการ', 404);
    }
    if (req.method !== 'POST') fail('Method not allowed', 405);
    sameOrigin(req);
    if (route === 'test-db-write') {
      if (!member.can_manage) fail('เฉพาะผู้ดูแล School', 403);
      const row = (await db('school_practice_questions?set_no=eq.2&select=question_id,question_image_url&order=question_no.asc&limit=1'))[0];
      if (!row) fail('ไม่พบข้อสอบชุดที่ 2', 404);
      await db(`school_practice_questions?question_id=eq.${encodeURIComponent(row.question_id)}`, 'PATCH',
        { question_image_url: row.question_image_url }, 'return=minimal');
      return res.status(200).json({ success: true, writable: true });
    }
    if (route === 'migrate-media') {
      if (!member.can_manage) fail('เฉพาะผู้ดูแล School', 403);
      const payload = body(req);
      const set = Number(payload.set_no ?? 2);
      if (!Number.isInteger(set) || set < 1 || set > 10) fail('ชุดฝึกไม่ถูกต้อง');
      const migrated = await migratePracticeMedia(set);
      return res.status(200).json({ success: true, migrated_count: migrated.length, migrated });
    }
    if (!['start', 'save', 'submit', 'grade'].includes(route)) fail('ไม่พบรายการ', 404);
    return res.status(200).json({ success: true, item: await transaction(route, member, body(req)) });
  } catch (error) { return sendError(res, error); }
}
