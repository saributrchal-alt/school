import { body, db, verifyBridge, memberId, findMember, requireMember, sameOrigin, fail, sendError, bridgeHealth, MEMBER_FIELDS, topicProgress, learningStudents, saveTopicProgress } from '../lib/school.js';

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


const LIVE_FIELDS = 'class_id,title,teacher_id,starts_at,ends_at,status,created_at,updated_at';

function liveClassId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('รหัสห้องเรียนไม่ถูกต้อง');
  return value.toLowerCase();
}

function validatedZoomLink(value) {
  if (typeof value !== 'string' || value.length > 2000) fail('กรุณาใส่ลิงก์ Zoom');
  let url;
  try { url = new URL(value.trim()); } catch { fail('ลิงก์ Zoom ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:' || url.username || url.password
      || !(url.hostname === 'zoom.us' || url.hostname.endsWith('.zoom.us'))
      || !/^\/j\/\d{9,13}\/?$/.test(url.pathname)) fail('ใช้ลิงก์เข้าประชุม Zoom (https://…zoom.us/j/…) เท่านั้น');
  url.hash = '';
  return url.toString();
}

function liveTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) fail('กรุณากำหนดวันเวลา');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail('วันเวลาไม่ถูกต้อง');
  return new Date(time).toISOString();
}

async function liveClasses(member) {
  const staff = Boolean(member.can_teach || member.can_manage);
  if (!staff && !member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์เรียนออนไลน์', 403);
  try {
    let classes = [];
    if (staff) {
      const filter = member.can_manage ? '' : '&teacher_id=eq.' + encodeURIComponent(member.member_id);
      classes = await db('school_live_classes?select=' + LIVE_FIELDS + ',zoom_join_url' + filter + '&order=starts_at.desc&limit=100');
    } else {
      const enrollments = await db('school_live_enrollments?member_id=eq.' + encodeURIComponent(member.member_id) + '&select=class_id&limit=100');
      if (enrollments.length) {
        classes = await db('school_live_classes?class_id=in.(' + enrollments.map(x => liveClassId(x.class_id)).join(',') + ')&select=' + LIVE_FIELDS + '&order=starts_at.desc&limit=100');
      } else {
        // Verify the schema exists even when this student has no classes.
        await db('school_live_classes?select=class_id&limit=0');
      }
    }
    const response = { setup_required:false, classes };
    if (staff) {
      const ids = classes.map(c => liveClassId(c.class_id));
      const group = ids.length ? 'class_id=in.(' + ids.join(',') + ')' : '';
      const [roster, clicks, students] = await Promise.all([
        ids.length ? db('school_live_enrollments?' + group + '&select=class_id,member_id&limit=10000') : [],
        ids.length ? db('school_live_join_clicks?' + group + '&select=class_id,member_id,clicked_at&limit=10000') : [],
        db('school_members?is_active=eq.true&can_study=eq.true&select=member_id,member_name&order=member_name.asc&limit=1000')
      ]);
      response.students = students;
      response.classes = classes.map(c => ({
        ...c,
        student_ids: roster.filter(x => x.class_id === c.class_id).map(x => x.member_id),
        join_clicks: clicks.filter(x => x.class_id === c.class_id)
      }));
    }
    return response;
  } catch (error) {
    if (error.code === 'school_schema_missing' && ['school_live_classes','school_live_enrollments','school_live_join_clicks'].includes(error.table)) {
      return { setup_required:true, classes:[], students:[] };
    }
    throw error;
  }
}

async function saveLiveClass(member, payload) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแลเปิดห้องเรียนได้', 403);
  const students = payload.student_ids;
  if (!Array.isArray(students) || students.length > 100 || students.some(id => typeof id !== 'string')) fail('รายชื่อนักเรียนไม่ถูกต้อง');
  const ids = [...new Set(students.map(memberId))];
  if (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.trim().length > 160) fail('กรุณากรอกชื่อคาบเรียน');
  const startsAt = liveTime(payload.starts_at), endsAt = liveTime(payload.ends_at);
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 8 * 60 * 60 * 1000) fail('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม และไม่เกิน 8 ชั่วโมง');
  const result = await db('rpc/school_live_save', 'POST', {
    p_actor_id:member.member_id, p_class_id:payload.class_id ? liveClassId(payload.class_id) : null,
    p_title:payload.title.trim(), p_starts_at:startsAt, p_ends_at:endsAt,
    p_zoom_join_url:validatedZoomLink(payload.zoom_join_url), p_student_ids:ids
  });
  return { class_id:result };
}

async function cancelLiveClass(member, payload) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแลยกเลิกห้องเรียนได้', 403);
  const id = liveClassId(payload.class_id);
  const row = (await db('school_live_classes?class_id=eq.' + id + '&select=class_id,teacher_id,status&limit=1'))[0];
  if (!row || (row.teacher_id !== member.member_id && !member.can_manage)) fail('ไม่มีสิทธิ์จัดการห้องเรียนนี้', 403);
  if (row.status === 'cancelled') return { class_id:id, status:'cancelled' };
  const changed = await db('school_live_classes?class_id=eq.' + id + '&status=eq.scheduled', 'PATCH',
    { status:'cancelled', updated_at:new Date().toISOString() });
  if (!changed.length) fail('ห้องเรียนถูกแก้ไขแล้ว กรุณาลองใหม่', 409);
  return { class_id:id, status:'cancelled' };
}

async function enterLiveClass(member, payload) {
  const id = liveClassId(payload.class_id);
  const row = (await db('school_live_classes?class_id=eq.' + id + '&select=class_id,teacher_id,starts_at,ends_at,status,zoom_join_url&limit=1'))[0];
  if (!row || row.status !== 'scheduled') fail('ไม่พบห้องเรียนที่เปิดอยู่', 404);
  const staff = Boolean(member.can_manage || (member.can_teach && row.teacher_id === member.member_id));
  if (!staff) {
    if (!member.can_study) fail('ไม่มีสิทธิ์เข้าห้องเรียนนี้', 403);
    const enrolled = (await db('school_live_enrollments?class_id=eq.' + id +
      '&member_id=eq.' + encodeURIComponent(member.member_id) + '&select=class_id&limit=1'))[0];
    if (!enrolled) fail('ครูยังไม่ได้เพิ่มชื่อเข้าห้องเรียนนี้', 403);
    const now = Date.now();
    if (now < Date.parse(row.starts_at) - 15 * 60 * 1000 || now > Date.parse(row.ends_at) + 15 * 60 * 1000)
      fail('เข้าห้องได้ตั้งแต่ 15 นาทีก่อนเริ่ม จนถึง 15 นาทีหลังเวลาเลิก', 409);
    await db('school_live_join_clicks?on_conflict=class_id,member_id', 'POST',
      { class_id:id, member_id:member.member_id }, 'resolution=ignore-duplicates,return=minimal');
  }
  return { join_url:validatedZoomLink(row.zoom_join_url), attendance_note:'บันทึกการกดเข้าห้องผ่าน School เท่านั้น' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const route = req.query?.route || 'catalog';
  try {
    if (route === 'health') {
      if (req.method !== 'GET') fail('Method not allowed', 405);
      // A readiness check only: limit=0 verifies access/schema without reading member rows.
      await bridgeHealth();
      return res.status(200).json({ success: true, status: 'ready' });
    }
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
    if (route === 'live-save' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success:true, item:await saveLiveClass(member, body(req)) });
    }
    if (route === 'live-cancel' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success:true, item:await cancelLiveClass(member, body(req)) });
    }
    if (route === 'live-join' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success:true, ...await enterLiveClass(member, body(req)) });
    }
    if (route === 'progress' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success: true, item: await saveTopicProgress(member, body(req)) });
    }
    if (req.method !== 'GET') fail('Method not allowed', 405);
    if (route === 'live-classes') return res.status(200).json({ success:true, ...await liveClasses(member) });
    if (route === 'progress') return res.status(200).json({ success: true, ...await topicProgress(member, req.query) });
    if (route === 'learning-results') return res.status(200).json({ success: true, ...await learningStudents(member) });
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
      db(`school_topic_progress?member_id=eq.${encodeURIComponent(member.member_id)}&select=topic_id,status,updated_at&limit=1000`)
    ]);
    const counts = {};
    for (const q of questions) { const t = counts[q.primary_topic_id] ||= { total: 0, year_2562: 0, year_2563: 0 }; t.total++; if (q.year_be === 2562) t.year_2562++; if (q.year_be === 2563) t.year_2563++; }
    return res.status(200).json({ success: true, member, subjects, chapters, topics: topics.map(t => ({ ...t, counts: counts[t.topic_id] || { total: 0, year_2562: 0, year_2563: 0 } })), progress, question_count: questions.length });
  } catch (error) { return sendError(res, error); }
}
