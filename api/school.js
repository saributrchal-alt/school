import { body, db, verifyBridge, memberId, findMember, requireMember, sameOrigin, fail, sendError, bridgeHealth, MEMBER_FIELDS, topicProgress, learningStudents, saveTopicProgress, explanationEditor, saveExplanationEditor } from '../lib/school.js';


const AS_WELL_ANSWERS=[
...Array(10).fill('as well'),
'She likes music as well.','I can swim as well.','He plays tennis as well.','We study science as well.','My brother is tall as well.','They like English as well.','I have a cat as well.','She can cook as well.','My father likes tea as well.','We are happy as well.',
'1','2','2','0','1',
'I like English as well.','She can swim as well.','My brother plays football as well.','We are students as well.','My mother likes coffee as well.'
];
const normalizeAsWell = v => String(v||'').toLowerCase().replace(/[.,!?]/g,'').replace(/\s+/g,' ').trim();
async function m1AsWellSubmit(member,payload){
  if(!member.can_study)fail('เฉพาะนักเรียนส่งคะแนนได้',403);
  if(!payload||!Array.isArray(payload.answers)||payload.answers.length!==30||payload.answers.some((a,i)=>typeof a!=='string'||a.length>500))fail('คำตอบไม่ถูกต้อง',400);
  const feedback=payload.answers.map((answer,i)=>({question_no:i+1,selected_answer:answer,answer:AS_WELL_ANSWERS[i],is_correct:normalizeAsWell(answer)===normalizeAsWell(AS_WELL_ANSWERS[i])}));
  const correct_count=feedback.filter(x=>x.is_correct).length;
  const rows=await db('school_m1_as_well_attempts','POST',{member_id:member.member_id,correct_count,total_count:30,feedback});
  return {attempt_id:rows[0]?.attempt_id,correct_count,total_count:30,feedback};
}
async function m1AsWellResults(member){
  if(!member.can_teach&&!member.can_manage)fail('เฉพาะครูและผู้ดูแล',403);
  const [members,attempts]=await Promise.all([db('school_members?select=member_id,member_name,can_study,is_active&order=member_name.asc&limit=1000'),db('school_m1_as_well_attempts?select=attempt_id,member_id,correct_count,total_count,feedback,submitted_at&order=submitted_at.desc&limit=1000')]);
  const latest=new Map(),counts=new Map();
  for(const a of attempts){counts.set(a.member_id,(counts.get(a.member_id)||0)+1);if(!latest.has(a.member_id))latest.set(a.member_id,a)}
  return {students:members.filter(m=>m.can_study||latest.has(m.member_id)).map(m=>{const a=latest.get(m.member_id);return {member_name:m.member_name,attempt_count:counts.get(m.member_id)||0,latest:a?{correct_count:a.correct_count,total_count:a.total_count,submitted_at:a.submitted_at,wrong_answers:a.feedback.filter(f=>!f.is_correct)}:null}}),truncated:attempts.length===1000};
}

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


const M1_SO_QUESTION_FIELDS = 'question_no,speaker_a,speaker_b';

async function m1SoPaper(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์เปิดแบบฝึกนี้',403);
  const questions=await db('school_m1_so_questions?select='+M1_SO_QUESTION_FIELDS+'&order=question_no.asc&limit=15');
  if (questions.length!==15) fail('แบบฝึก ม.1 ยังไม่พร้อมใช้งาน',503);
  return {questions};
}

async function m1SoHistory(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์ดูประวัติ',403);
  const rows=await db('school_m1_so_attempts?member_id=eq.'+encodeURIComponent(member.member_id)+
    '&select=attempt_id,correct_count,total_count,submitted_at&order=submitted_at.desc&limit=20');
  return {attempts:rows};
}

async function m1SoSubmit(member, payload) {
  if (!member.can_study) fail('เฉพาะนักเรียนจึงบันทึกคะแนนแบบฝึกได้',403);
  if (!payload || !Array.isArray(payload.answers) || payload.answers.length!==15 ||
      payload.answers.some(item=>!item || !Number.isInteger(item.question_no) ||
        item.question_no<1 || item.question_no>15 ||
        typeof item.answer!=='string' || item.answer.length>20))
    fail('กรุณาส่งคำตอบให้ครบทั้ง 15 ข้อ',400);
  try {
    const graded=await db('rpc/school_m1_so_grade','POST',{
      p_member_id:member.member_id,
      p_answers:payload.answers
    });
    if (!graded?.attempt_id || !Array.isArray(graded.feedback)) fail('บันทึกผลการฝึกไม่สำเร็จ',503);
    return graded;
  } catch(error) {
    if (error.dbCode==='PT400') fail('ข้อมูลคำตอบไม่ถูกต้อง กรุณาลองใหม่',400);
    if (error.dbCode==='PT403') fail('บัญชีนี้ไม่มีสิทธิ์บันทึกคะแนน',403);
    if (error.dbCode==='PT503') fail('แบบฝึกนี้ยังไม่พร้อม กรุณาแจ้งผู้ดูแล',503);
    throw error;
  }
}

async function m1SoTeacherResults(member) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแลจึงเห็นผลนักเรียน',403);
  const [members,rows]=await Promise.all([
    db('school_members?select=member_id,member_name,can_study,is_active&order=member_name.asc&limit=1000'),
    db('school_m1_so_attempts?select=attempt_id,member_id,correct_count,total_count,feedback,submitted_at&order=submitted_at.desc&limit=1000')
  ]);
  const memberNames=new Map(members.map(m=>[m.member_id,m.member_name]));
  const latest=new Map(),counts=new Map();
  for(const a of rows) {
    counts.set(a.member_id,(counts.get(a.member_id)||0)+1);
    if(latest.has(a.member_id)) continue;
    const wrong=(Array.isArray(a.feedback)?a.feedback:[])
      .filter(x=>x && x.is_correct===false)
      .map(x=>({question_no:x.question_no,selected_answer:x.selected_answer,
                 answer:x.answer,explanation:x.explanation}));
    latest.set(a.member_id,{
      member_id:a.member_id,member_name:memberNames.get(a.member_id)||'นักเรียน (ถอนสิทธิ์)',
      correct_count:a.correct_count,total_count:a.total_count,submitted_at:a.submitted_at,
      wrong_answers:wrong
    });
  }
  const students=members.filter(m=>m.can_study || latest.has(m.member_id)).map(m=>{
    const last=latest.get(m.member_id);
    return {member_id:m.member_id,member_name:m.member_name,is_active:m.is_active,
      attempt_count:counts.get(m.member_id)||0,
      latest:last?{correct_count:last.correct_count,total_count:last.total_count,
        submitted_at:last.submitted_at,wrong_answers:last.wrong_answers}:null};
  });
  return {students,showing_latest_attempts:rows.length,
    truncated:rows.length===1000};
}

const M1_DAYS_QUESTION_FIELDS = 'question_no,prompt_en,prompt_th';

async function m1DaysPaper(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์เปิดแบบฝึกนี้',403);
  const questions=await db('school_m1_days_questions?select='+M1_DAYS_QUESTION_FIELDS+'&order=question_no.asc&limit=20');
  if (questions.length!==20) fail('แบบฝึก ม.1 ยังไม่พร้อมใช้งาน',503);
  return {questions};
}

async function m1DaysHistory(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์ดูประวัติ',403);
  const rows=await db('school_m1_days_attempts?member_id=eq.'+encodeURIComponent(member.member_id)+
    '&select=attempt_id,correct_count,total_count,submitted_at&order=submitted_at.desc&limit=20');
  return {attempts:rows};
}

async function m1DaysSubmit(member, payload) {
  if (!member.can_study) fail('เฉพาะนักเรียนจึงบันทึกคะแนนแบบฝึกได้',403);
  if (!payload || !Array.isArray(payload.answers) || payload.answers.length!==20 ||
      payload.answers.some(item=>!item || !Number.isInteger(item.question_no) ||
        item.question_no<1 || item.question_no>20 ||
        typeof item.answer!=='string' || item.answer.length>80))
    fail('กรุณาส่งคำตอบให้ครบทั้ง 20 ข้อ',400);
  try {
    const graded=await db('rpc/school_m1_days_grade','POST',{
      p_member_id:member.member_id,
      p_answers:payload.answers
    });
    if (!graded?.attempt_id || !Array.isArray(graded.feedback)) fail('บันทึกผลการฝึกไม่สำเร็จ',503);
    return graded;
  } catch(error) {
    if (error.dbCode==='PT400') fail('ข้อมูลคำตอบไม่ถูกต้อง กรุณาลองใหม่',400);
    if (error.dbCode==='PT403') fail('บัญชีนี้ไม่มีสิทธิ์บันทึกคะแนน',403);
    if (error.dbCode==='PT503') fail('แบบฝึกนี้ยังไม่พร้อม กรุณาแจ้งผู้ดูแล',503);
    throw error;
  }
}

async function m1DaysTeacherResults(member) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแลจึงเห็นผลนักเรียน',403);
  const [members,rows]=await Promise.all([
    db('school_members?select=member_id,member_name,can_study,is_active&order=member_name.asc&limit=1000'),
    db('school_m1_days_attempts?select=attempt_id,member_id,correct_count,total_count,feedback,submitted_at&order=submitted_at.desc&limit=1000')
  ]);
  const memberNames=new Map(members.map(m=>[m.member_id,m.member_name]));
  const latest=new Map(),counts=new Map();
  for(const a of rows) {
    counts.set(a.member_id,(counts.get(a.member_id)||0)+1);
    if(latest.has(a.member_id)) continue;
    const wrong=(Array.isArray(a.feedback)?a.feedback:[])
      .filter(x=>x && x.is_correct===false)
      .map(x=>({question_no:x.question_no,selected_answer:x.selected_answer,
                 answer:x.answer,explanation:x.explanation}));
    latest.set(a.member_id,{
      member_id:a.member_id,member_name:memberNames.get(a.member_id)||'นักเรียน (ถอนสิทธิ์)',
      correct_count:a.correct_count,total_count:a.total_count,submitted_at:a.submitted_at,
      wrong_answers:wrong
    });
  }
  const students=members.filter(m=>m.can_study || latest.has(m.member_id)).map(m=>{
    const last=latest.get(m.member_id);
    return {member_id:m.member_id,member_name:m.member_name,is_active:m.is_active,
      attempt_count:counts.get(m.member_id)||0,
      latest:last?{correct_count:last.correct_count,total_count:last.total_count,
        submitted_at:last.submitted_at,wrong_answers:last.wrong_answers}:null};
  });
  return {students,showing_latest_attempts:rows.length,
    truncated:rows.length===1000};
}


const M1_TIME_FIELDS='question_no,prompt_en,image_url,choices';

async function m1TimePaper(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์เปิดแบบฝึกนี้',403);
  const questions=await db('school_m1_time_questions?select='+M1_TIME_FIELDS+'&order=question_no.asc&limit=20');
  if (questions.length!==20) fail('แบบฝึก What Time Is It? ยังไม่พร้อม',503);
  return {questions};
}

async function m1TimeHistory(member) {
  if (!member.can_study && !member.can_teach && !member.can_manage) fail('ไม่มีสิทธิ์ดูประวัติ',403);
  const attempts=await db('school_m1_time_attempts?member_id=eq.'+encodeURIComponent(member.member_id)
    +'&select=attempt_id,correct_count,total_count,submitted_at&order=submitted_at.desc&limit=20');
  return {attempts};
}

async function m1TimeSubmit(member,payload) {
  if (!member.can_study) fail('เฉพาะนักเรียนจึงบันทึกคะแนนได้',403);
  if (!payload || !Array.isArray(payload.answers) || payload.answers.length!==20 ||
      payload.answers.some(a=>!a || !Number.isInteger(a.question_no) || a.question_no<1 || a.question_no>20 ||
        !Number.isInteger(a.choice) || a.choice<1 || a.choice>4) ||
      new Set(payload.answers.map(a=>a.question_no)).size!==20)
    fail('กรุณาตอบทั้ง 20 ข้อก่อนส่งตรวจ',400);
  try {
    const graded=await db('rpc/school_m1_time_grade','POST',{p_member_id:member.member_id,p_answers:payload.answers});
    if (!graded?.attempt_id || !Array.isArray(graded.feedback) || graded.feedback.length!==20)
      fail('บันทึกผลไม่สำเร็จ',503);
    return graded;
  }catch(error) {
    if (error.dbCode==='PT400') fail('คำตอบไม่ครบหรือไม่ถูกต้อง',400);
    if (error.dbCode==='PT403') fail('บัญชีนี้ไม่มีสิทธิ์บันทึกคะแนน',403);
    if (error.dbCode==='PT503') fail('แบบฝึกยังไม่พร้อม',503);
    throw error;
  }
}

async function m1TimeTeacherResults(member) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแล',403);
  const [members,attempts]=await Promise.all([
    db('school_members?select=member_id,member_name,can_study,is_active&order=member_name.asc&limit=1000'),
    db('school_m1_time_attempts?select=member_id,correct_count,total_count,feedback,submitted_at&order=submitted_at.desc&limit=1000')
  ]);
  const latest=new Map(),count=new Map(),names=new Map(members.map(x=>[x.member_id,x.member_name]));
  for (const a of attempts) {
    count.set(a.member_id,(count.get(a.member_id)||0)+1);
    if (latest.has(a.member_id)) continue;
    const wrong=(Array.isArray(a.feedback)?a.feedback:[]).filter(f=>f.is_correct===false);
    latest.set(a.member_id,{
      correct_count:a.correct_count,total_count:a.total_count,submitted_at:a.submitted_at,
      wrong_answers:wrong
    });
  }
  return {students:members.filter(m=>m.can_study || latest.has(m.member_id)).map(m=>({
    member_id:m.member_id,member_name:m.member_name,is_active:m.is_active,
    attempt_count:count.get(m.member_id)||0,latest:latest.get(m.member_id)||null
  })),truncated:attempts.length===1000};
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
    if (route === 'explanation-editor-save' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success:true,item:await saveExplanationEditor(member,body(req)) });
    }
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
    if (route === 'm1-as-well-submit' && req.method === 'POST') { sameOrigin(req); return res.status(200).json({success:true,item:await m1AsWellSubmit(member,body(req))}); }
    if (route === 'm1-so-submit' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({success:true,item:await m1SoSubmit(member,body(req))});
    }
    if (route === 'm1-time-submit' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({success:true,item:await m1TimeSubmit(member,body(req))});
    }
    if (route === 'm1-days-submit' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({success:true,item:await m1DaysSubmit(member,body(req))});
    }
    if (route === 'progress' && req.method === 'POST') {
      sameOrigin(req);
      return res.status(200).json({ success: true, item: await saveTopicProgress(member, body(req)) });
    }
    if (req.method !== 'GET') fail('Method not allowed', 405);
    if (route === 'explanation-editor') return res.status(200).json({success:true,...await explanationEditor(member,req.query)});
    if (route === 'secondary-assignment-register' && req.method === 'POST') {
      sameOrigin(req);
      if (!member.can_manage) fail('เฉพาะผู้ดูแล School ลงทะเบียนแบบฝึกหัดได้',403);
      const p=body(req);
      const grade=Number(p.grade),key=String(p.assignment_key||''),subject=String(p.subject||'').trim(),title=String(p.title||'').trim(),resultsRoute=String(p.results_route||'');
      const supported={'m1-as-well-results':1,'m1-so-results':1,'m1-days-results':1,'m1-time-results':1};
      if (!Number.isInteger(grade)||grade<1||grade>6||!/^[a-z0-9-]{3,80}$/.test(key)||!subject||subject.length>100||!title||title.length>180||supported[resultsRoute]!==grade) fail('แบบฝึกหัดนี้ยังไม่มี API รายงานที่รองรับระดับชั้นดังกล่าว',400);
      const rows=await db('school_secondary_assignments?on_conflict=assignment_key','POST',{assignment_key:key,grade,subject,title,results_route:resultsRoute,is_active:true},'resolution=merge-duplicates,return=representation');
      return res.status(200).json({success:true,assignment:rows[0]});
    }
    if (route === 'secondary-assignments') {
      if (!member.can_teach && !member.can_manage) fail('เฉพาะครูและผู้ดูแล',403);
      const grade=Number(req.query.grade);
      if (!Number.isInteger(grade)||grade<1||grade>6) fail('ระดับชั้นไม่ถูกต้อง',400);
      const assignments=await db('school_secondary_assignments?grade=eq.'+grade+'&is_active=eq.true&select=assignment_key,grade,subject,title,results_route&order=subject.asc,title.asc&limit=500');
      return res.status(200).json({success:true,assignments});
    }
    if (route === 'secondary-assignment-results') {
      if (!member.can_teach && !member.can_manage) fail('เฉพาะครูและผู้ดูแล',403);
      const key=String(req.query.key||'');
      if (!/^[a-z0-9-]{3,80}$/.test(key)) fail('รหัสแบบฝึกหัดไม่ถูกต้อง',400);
      const rows=await db('school_secondary_assignments?assignment_key=eq.'+encodeURIComponent(key)+'&is_active=eq.true&select=assignment_key,grade,subject,title,results_route&limit=1');
      const item=rows[0]; if(!item) fail('ไม่พบแบบฝึกหัด',404);
      const handlers={'m1-as-well-results':m1AsWellResults,'m1-so-results':m1SoTeacherResults,'m1-days-results':m1DaysTeacherResults,'m1-time-results':m1TimeTeacherResults};
      const handler=handlers[item.results_route];
      if(!handler) fail('แบบฝึกหัดนี้ยังไม่ได้เชื่อมรายงาน กรุณาแจ้งผู้ดูแล',503);
      return res.status(200).json({success:true,assignment:item,...await handler(member)});
    }
    if (route === 'm1-as-well-results') return res.status(200).json({success:true,...await m1AsWellResults(member)});
    if (route === 'm1-so-paper') return res.status(200).json({success:true,...await m1SoPaper(member)});
    if (route === 'm1-so-history') return res.status(200).json({success:true,...await m1SoHistory(member)});
    if (route === 'm1-so-results') return res.status(200).json({success:true,...await m1SoTeacherResults(member)});
    if (route === 'm1-time-paper') return res.status(200).json({success:true,...await m1TimePaper(member)});
    if (route === 'm1-time-history') return res.status(200).json({success:true,...await m1TimeHistory(member)});
    if (route === 'm1-time-results') return res.status(200).json({success:true,...await m1TimeTeacherResults(member)});
    if (route === 'm1-days-paper') return res.status(200).json({success:true,...await m1DaysPaper(member)});
    if (route === 'm1-days-history') return res.status(200).json({success:true,...await m1DaysHistory(member)});
    if (route === 'm1-days-results') return res.status(200).json({success:true,...await m1DaysTeacherResults(member)});
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
