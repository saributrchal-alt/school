import { db, fail, findMember } from './school.js';

const ATTEMPT_FIELDS = 'attempt_id,member_id,set_no,subject_id,status,total_count,correct_count,submitted_at,graded_at,graded_by,updated_at';
const QUESTION_FIELDS = 'question_id,set_no,topic_id,subject_id,sort_order,prompt,choices,question_no,question_image_url,source_page,source_year,source_title,source_type';
const META_FIELDS = 'question_id,set_no,topic_id,subject_id';
const REVIEW_FIELDS = ',answer_key,explanation,reasoning,source_question_ids';
const enc = encodeURIComponent;

export function setNo(value) {
  if (!/^(?:[1-9]|10)$/.test(String(value ?? ''))) fail('ชุดฝึกไม่ถูกต้อง');
  return Number(value);
}
export function subjectId(value) {
  if (!['ENG', 'MATH', 'SCI', 'THAI', 'SOC'].includes(value)) fail('วิชาไม่ถูกต้อง');
  return value;
}
export function attemptId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail('รายการทำโจทย์ไม่ถูกต้อง');
  return value;
}
export function safeAttempt(a) {
  const { attempt_id, set_no, subject_id, status, total_count, submitted_at, graded_at, updated_at } = a;
  return { attempt_id, set_no, subject_id, status, total_count, submitted_at, graded_at, updated_at,
    ...(status === 'graded' ? { correct_count: a.correct_count } : {}) };
}

async function allRows(path) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const batch = await db(`${path}&limit=1000&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  fail('ข้อมูลชุดฝึกมากเกินขอบเขต กรุณาให้ผู้ดูแลตรวจสอบ', 503);
}

export async function summary(member) {
  const [sets, topics, attempts] = await Promise.all([
    db('school_practice_sets?is_active=eq.true&select=set_no,label,display_label,source_year,source_title,source_type&order=set_no.asc'),
    allRows(`school_practice_questions?select=${META_FIELDS}&order=set_no.asc,subject_id.asc,topic_id.asc`),
    db(`school_practice_attempts?member_id=eq.${enc(member.member_id)}&select=${ATTEMPT_FIELDS}&order=set_no.asc,subject_id.asc&limit=100`)
  ]);
  const available = new Set(sets.map(s => s.set_no));
  const visibleTopics = topics.filter(q => available.has(q.set_no));
  const own = new Map(attempts.map(a => [a.attempt_id, a]));
  const answers = own.size ? await allRows(`school_practice_answers?attempt_id=in.(${[...own.keys()].map(attemptId).join(',')})&select=attempt_id,question_id,selected_answer,is_correct&order=attempt_id.asc,question_id.asc`) : [];
  const counts = new Map();
  for (const q of visibleTopics) {
    const key = `${q.set_no}/${q.subject_id}`;
    const count = counts.get(key) || { set_no: q.set_no, subject_id: q.subject_id, total_count: 0 };
    count.total_count++; counts.set(key, count);
  }
  return { ready: visibleTopics.length > 0, sets, topics: visibleTopics, counts: [...counts.values()],
    attempts: attempts.filter(a => available.has(a.set_no)).map(safeAttempt),
    answers: answers.filter(a => available.has(own.get(a.attempt_id)?.set_no)).map(a => ({
      attempt_id: a.attempt_id, question_id: a.question_id, selected_answer: a.selected_answer,
      ...(own.get(a.attempt_id)?.status === 'graded' ? { is_correct: a.is_correct } : {})
    })) };
}

export async function subject(member, query) {
  let a;
  const set = setNo(query.set_no), sid = subjectId(query.subject_id);
  if (!member.can_teach && !member.can_manage) {
    if (!(await db(`school_practice_sets?set_no=eq.${set}&is_active=eq.true&select=set_no&limit=1`))[0]) fail('ชุดฝึกนี้ยังไม่เปิดใช้งาน', 404);
  }
  if (query.attempt_id) {
    if (!member.can_manage && !member.can_teach) fail('เฉพาะครูหรือผู้ดูแล School เปิดผลของนักเรียนได้', 403);
    a = (await db(`school_practice_attempts?attempt_id=eq.${attemptId(query.attempt_id)}&select=${ATTEMPT_FIELDS}&limit=1`))[0];
    if (!a || a.set_no !== set || a.subject_id !== sid) fail('ไม่พบรายการทำโจทย์', 404);
    if (!member.can_manage && a.status !== 'graded') fail('ครูเปิดคำตอบรายข้อได้เมื่อผู้ดูแลตรวจและเปิดผลแล้ว', 403);
  } else {
    a = (await db(`school_practice_attempts?member_id=eq.${enc(member.member_id)}&set_no=eq.${set}&subject_id=eq.${sid}&select=${ATTEMPT_FIELDS}&limit=1`))[0];
  }
  const canReview = Boolean(member.can_teach || member.can_manage || a?.status === 'graded');
  // Topic IDs encode the chapter and topic order; sort_order restarts in each chapter.
  const questionOrder = set === 1 ? 'topic_id.asc' : 'sort_order.asc,question_id.asc';
  const questions = await db(`school_practice_questions?set_no=eq.${set}&subject_id=eq.${sid}&select=${QUESTION_FIELDS}${canReview ? REVIEW_FIELDS : ''}&order=${questionOrder}&limit=1000`);
  if (!questions.length) fail('วิชานี้ยังไม่มีโจทย์ในชุดที่เลือก', 404);
  const answers = a ? await db(`school_practice_answers?attempt_id=eq.${attemptId(a.attempt_id)}&select=question_id,selected_answer${a.status === 'graded' ? ',is_correct' : ''}&order=question_id.asc&limit=1000`) : [];
  let context = {};
  if (query.attempt_id) {
    const [student, grader] = await Promise.all([
      findMember(a.member_id), a.status === 'graded' ? findMember(a.graded_by) : null
    ]);
    context = { student: { member_id: a.member_id, member_name: student?.member_name || 'สมาชิก School' },
      ...(a.status === 'graded' ? { graded_by_name: grader?.member_name || a.graded_by } : {}) };
  }
  return { set_no: set, subject_id: sid, questions, answers, attempt: a ? safeAttempt(a) : null, can_review: canReview, ...context };
}

export async function studentResults(member, query) {
  if (!member.can_teach && !member.can_manage) fail('เฉพาะครูหรือผู้ดูแล School ดูผลตรวจรายคนได้', 403);
  const set = setNo(query.set_no);
  const sets = await db('school_practice_sets?select=set_no,label,display_label,is_active&order=set_no.asc&limit=10');
  if (!sets.some(s => s.set_no === set)) fail('ไม่พบชุดฝึกนี้', 404);
  // Reports need all pages, including former students whose learning history is retained.
  const [members, attempts, questions] = await Promise.all([
    allRows('school_members?select=member_id,member_name,can_study,is_active&order=member_id.asc'),
    allRows(`school_practice_attempts?set_no=eq.${set}&select=${ATTEMPT_FIELDS}&order=member_id.asc,subject_id.asc,attempt_id.asc`),
    allRows(`school_practice_questions?set_no=eq.${set}&select=${META_FIELDS}&order=question_id.asc`)
  ]);
  const names = new Map(members.map(m => [m.member_id, m.member_name]));
  const grouped = new Map(), counts = new Map();
  for (const q of questions) counts.set(q.subject_id, (counts.get(q.subject_id) || 0) + 1);
  for (const a of attempts) {
    if (!grouped.has(a.member_id)) grouped.set(a.member_id, []);
    grouped.get(a.member_id).push({ ...safeAttempt(a), ...(a.status === 'graded' ? {
      graded_by: a.graded_by, graded_by_name: names.get(a.graded_by) || a.graded_by
    } : {}) });
  }
  return { set_no: set, sets, counts: [...counts].map(([subject_id, total_count]) => ({ subject_id, total_count })),
    students: members.filter(m => m.can_study || grouped.has(m.member_id)).map(m => ({
      ...m, attempts: grouped.get(m.member_id) || []
    })) };
}

export async function reviewQueue() {
  const attempts = await db(`school_practice_attempts?status=eq.submitted&select=${ATTEMPT_FIELDS}&order=submitted_at.asc&limit=100`);
  if (!attempts.length) return [];
  const ids = [...new Set(attempts.map(a => a.member_id))];
  if (ids.some(id => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))) fail('ข้อมูลสมาชิกไม่ถูกต้อง', 503);
  const members = await db(`school_members?member_id=in.(${ids.join(',')})&select=member_id,member_name&limit=100`);
  const names = new Map(members.map(m => [m.member_id, m.member_name]));
  return attempts.map(a => ({ ...safeAttempt(a), member_name: names.get(a.member_id) || 'สมาชิก School' }));
}

export async function transaction(action, member, p) {
  let payload;
  if (action === 'grade') {
    if (!member.can_manage) fail('เฉพาะผู้ดูแล School กดตรวจและเปิดผลได้', 403);
    payload = { p_grader_id: member.member_id, p_attempt_id: attemptId(p.attempt_id) };
  } else {
    if (!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์ทำและส่งคำตอบ', 403);
    payload = { p_member_id: member.member_id };
    if (action === 'start') Object.assign(payload, { p_set_no: setNo(p.set_no), p_subject_id: subjectId(p.subject_id) });
    else {
      payload.p_attempt_id = attemptId(p.attempt_id);
      if (action === 'save') {
        if (typeof p.question_id !== 'string' || !/^(?:P\d{2}-[A-Z]+-\d{2}\.\d{2}|EX2564-[A-Z]+-\d{3})$/.test(p.question_id)
          || !Number.isInteger(p.selected_answer) || p.selected_answer < 1 || p.selected_answer > 10) fail('กรุณาเลือกคำตอบที่ถูกต้อง');
        Object.assign(payload, { p_question_id: p.question_id, p_selected_answer: p.selected_answer });
      }
    }
  }
  try {
    const result = await db(`rpc/school_practice_${action}`, 'POST', payload);
    return action === 'save' ? { attempt_id: result.attempt_id, question_id: result.question_id, selected_answer: result.selected_answer } : safeAttempt(result);
  } catch (error) {
    const messages = {
      PT400: ['ข้อมูลคำตอบไม่ถูกต้อง', 400], PT403: ['สิทธิ์ School เปลี่ยนแล้ว กรุณาเข้าใหม่', 403],
      PT404: ['ไม่พบชุดฝึกหรือรายการทำโจทย์นี้', 404], PT422: ['กรุณาตอบและบันทึกให้ครบทุกหัวข้อในวิชานี้ก่อนส่ง', 422],
      PT409: [action === 'grade' ? 'ตรวจได้เฉพาะรายการที่ส่งครบแล้ว กรุณาเปิดรายการใหม่' : 'คำตอบชุดนี้ถูกล็อกหรือข้อมูลโจทย์เปลี่ยนแล้ว กรุณาเปิดรายการใหม่', 409]
    };
    if (messages[error.dbCode]) fail(...messages[error.dbCode]);
    throw error;
  }
}
