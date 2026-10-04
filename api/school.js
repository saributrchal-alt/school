import { body, db, verifyBridge, memberId, findMember, requireMember, sameOrigin, fail, sendError, MEMBER_FIELDS } from '../lib/school.js';

async function importMember(req, res) {
  const p = body(req);
  verifyBridge(req, p);
  memberId(p.member_id); memberId(p.assigned_by);
  if (typeof p.member_name !== 'string' || !p.member_name.trim() || p.member_name.length > 250
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.event_id || '')) fail('ข้อมูลสมาชิกไม่ครบ');
  for (const key of ['can_study', 'can_teach', 'can_manage', 'is_active']) if (typeof p[key] !== 'boolean') fail('สิทธิ์สมาชิกไม่ถูกต้อง');
  if (p.is_active && !(p.can_study || p.can_teach || p.can_manage)) fail('กรุณาเลือกสิทธิ์อย่างน้อยหนึ่งรายการ');
  const previousEvent = (await db(`school_member_bridge_events?event_id=eq.${p.event_id}&select=*&limit=1`))[0];
  if (previousEvent) {
    if (previousEvent.member_id !== p.member_id || previousEvent.assigned_by !== p.assigned_by
        || ['can_study','can_teach','can_manage','is_active'].some(k => previousEvent[k] !== p[k])) fail('รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว', 409);
    return res.status(200).json({ success: true, item: await findMember(p.member_id) });
  }
  const record = {
    member_id: p.member_id, member_name: p.member_name.trim(), can_study: p.can_study,
    can_teach: p.can_teach, can_manage: p.can_manage, is_active: p.is_active,
    assigned_by: p.assigned_by, assigned_at: new Date(p.issued_at).toISOString(), updated_at: new Date().toISOString()
  };
  let existing = await findMember(p.member_id);
  let item;
  if (!existing) {
    try { item = (await db('school_members', 'POST', record))[0]; }
    catch (error) { if (error.status !== 409) throw error; existing = await findMember(p.member_id); }
  }
  if (existing) {
    if (Date.parse(existing.assigned_at) > Date.parse(record.assigned_at)) fail('มีคำสั่งมอบสิทธิ์ใหม่กว่าแล้ว กรุณาลองอีกครั้ง', 409);
    item = (await db(`school_members?member_id=eq.${encodeURIComponent(p.member_id)}&assigned_at=lte.${encodeURIComponent(record.assigned_at)}`, 'PATCH', record))[0];
    if (!item) fail('มีคำสั่งมอบสิทธิ์ใหม่กว่าแล้ว กรุณาลองอีกครั้ง', 409);
  }
  if (!item) fail('บันทึกสมาชิกไม่สำเร็จ', 503);
  const event = { event_id: p.event_id, member_id: p.member_id, assigned_by: p.assigned_by,
    action: p.is_active ? 'upsert' : 'deactivate', can_study: p.can_study, can_teach: p.can_teach,
    can_manage: p.can_manage, is_active: p.is_active };
  try { await db('school_member_bridge_events', 'POST', event); }
  catch (error) { if (error.status !== 409) throw error; }
  return res.status(200).json({ success: true, item });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const route = req.query?.route || 'catalog';
  try {
    if (route === 'member-status') {
      if (req.method !== 'POST') fail('Method not allowed', 405);
      const p = body(req);
      verifyBridge(req, p);
      return res.status(200).json({ success: true, member: await findMember(memberId(p.member_id)) });
    }
    if (route === 'member-import') {
      if (req.method !== 'POST') fail('Method not allowed', 405);
      return await importMember(req, res);
    }
    const member = await requireMember(req);
    if (route === 'progress' && req.method === 'POST') {
      sameOrigin(req);
      if (!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์บันทึกการเรียน', 403);
      const p = body(req);
      if (!/^[A-Z]+-\d{2}\.\d{2}$/.test(p.topic_id || '') || !['not_started','in_progress','review','completed'].includes(p.status)) fail('ข้อมูลการเรียนไม่ถูกต้อง');
      if (!(await db(`exam_topics?topic_id=eq.${encodeURIComponent(p.topic_id)}&select=topic_id&limit=1`))[0]) fail('ไม่พบหัวข้อเรียน', 404);
      const rows = await db('school_topic_progress?on_conflict=member_id,topic_id', 'POST', {
        member_id: member.member_id, topic_id: p.topic_id, status: p.status, updated_at: new Date().toISOString()
      }, 'resolution=merge-duplicates,return=representation');
      return res.status(200).json({ success: true, item: rows[0] });
    }
    if (req.method !== 'GET') fail('Method not allowed', 405);
    if (route === 'members') {
      if (!member.can_manage) fail('เฉพาะผู้ดูแล School', 403);
      return res.status(200).json({ success: true, members: await db(`school_members?select=${MEMBER_FIELDS}&order=assigned_at.desc&limit=1000`) });
    }
    if (route === 'questions') {
      if (!/^[A-Z]+-\d{2}\.\d{2}$/.test(req.query.topic_id || '')) fail('หัวข้อไม่ถูกต้อง');
      const keys = member.can_teach || member.can_manage ? ',answer_key' : '';
      const questions = await db(`exam_questions?source_id=eq.EX62_63&primary_topic_id=eq.${encodeURIComponent(req.query.topic_id)}&select=question_id,year_be,exam_question_no,content_focus_th,pdf_pages,printed_pages${keys}&order=year_be.asc,exam_question_no.asc&limit=1000`);
      return res.status(200).json({ success: true, questions });
    }
    if (route !== 'catalog') fail('ไม่พบรายการ', 404);
    const [subjects, chapters, topics, questions, progress] = await Promise.all([
      db('exam_subjects_master?select=*&order=subject_id.asc&limit=1000'),
      db('exam_chapters?select=*&order=sort_order.asc&limit=1000'),
      db('exam_topics?select=*&order=sort_order.asc&limit=1000'),
      db('exam_questions?source_id=eq.EX62_63&select=primary_topic_id,year_be&limit=1000'),
      db(`school_topic_progress?member_id=eq.${encodeURIComponent(member.member_id)}&select=topic_id,status&limit=1000`)
    ]);
    const counts = {};
    for (const q of questions) { const t = counts[q.primary_topic_id] ||= { total: 0, year_2562: 0, year_2563: 0 }; t.total++; if (q.year_be === 2562) t.year_2562++; if (q.year_be === 2563) t.year_2563++; }
    return res.status(200).json({ success: true, member, subjects, chapters, topics: topics.map(t => ({ ...t, counts: counts[t.topic_id] || { total: 0, year_2562: 0, year_2563: 0 } })), progress, question_count: questions.length });
  } catch (error) { return sendError(res, error); }
}
