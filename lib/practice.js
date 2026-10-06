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


/* =========================
   Military-prep real exam sessions
   ========================= */

const EXAM_SESSION_FIELDS = 'session_id,title,instructions,set_no,subject_id,duration_minutes,opens_at,closes_at,start_policy,fixed_start_at,allow_submit_early,require_all_answers,allow_resume,max_attempts,shuffle_questions,result_policy,result_release_at,answer_policy,answer_release_at,audience_mode,is_published,created_by,updated_by,created_at,updated_at';
const EXAM_ATTEMPT_FIELDS = 'exam_attempt_id,session_id,member_id,attempt_no,status,total_count,correct_count,started_at,deadline_at,submitted_at,timed_out,updated_at';

function examUuid(value,label='รอบสอบ') {
  const v=String(value||'');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)) fail(label+'ไม่ถูกต้อง');
  return v;
}

function examStaff(member) {
  if(!member.can_teach&&!member.can_manage) fail('เฉพาะครูหรือผู้ดูแล School จัดการรอบสอบได้',403);
}

function examDate(value,label,required=false) {
  if(value===null||value===undefined||value==='') {
    if(required) fail('กรุณาระบุ'+label);
    return null;
  }
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) fail(label+'ไม่ถูกต้อง');
  return d.toISOString();
}

function examBoolean(value,fallback=false) {
  if(value===true||value===false) return value;
  return fallback;
}

function examInt(value,min,max,label) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max) fail(label+'ไม่ถูกต้อง');
  return n;
}

function safeExamSession(row) {
  return {...row,subject_id:row.subject_id||'ALL'};
}

async function examOwnedSession(member,id) {
  const row=(await db('school_exam_sessions?session_id=eq.'+examUuid(id)+'&select='+EXAM_SESSION_FIELDS+'&limit=1'))[0];
  if(!row) fail('ไม่พบรอบสอบ',404);
  if(!member.can_manage && row.created_by!==member.member_id) fail('ครูแก้ไขได้เฉพาะรอบสอบที่ตนสร้าง',403);
  return row;
}

export async function examSessions(member) {
  const staff=Boolean(member.can_teach||member.can_manage);
  const sessions=await db(
    'school_exam_sessions?'+(staff?'':'is_published=eq.true&')+'select='+EXAM_SESSION_FIELDS+'&order=created_at.desc&limit=200'
  );

  let visible=sessions;
  if(!staff && sessions.some(s=>s.audience_mode==='selected')) {
    const membership=await db('school_exam_session_members?member_id=eq.'+enc(member.member_id)+'&select=session_id&limit=500');
    const allowed=new Set(membership.map(x=>x.session_id));
    visible=sessions.filter(s=>s.audience_mode==='all_students'||allowed.has(s.session_id));
  }

  const sessionIds=visible.map(s=>s.session_id);
  const attempts=sessionIds.length
    ? await allRows('school_exam_attempts?session_id=in.('+sessionIds.join(',')+')&select='+EXAM_ATTEMPT_FIELDS+'&order=session_id.asc,attempt_no.asc')
    : [];

  if(staff) {
    const counts=new Map();
    for(const a of attempts) {
      const x=counts.get(a.session_id)||{attempt_count:0,submitted_count:0,student_count:new Set()};
      x.attempt_count++;
      if(a.status==='submitted') x.submitted_count++;
      x.student_count.add(a.member_id);
      counts.set(a.session_id,x);
    }
    return {
      server_time:new Date().toISOString(),
      sessions:visible.map(row=>{
        const s=safeExamSession(row), x=counts.get(row.session_id);
        return {...s,attempt_count:x?.attempt_count||0,submitted_count:x?.submitted_count||0,student_count:x?.student_count.size||0};
      })
    };
  }

  return {
    server_time:new Date().toISOString(),
    sessions:visible.map(safeExamSession),
    attempts:attempts.filter(a=>a.member_id===member.member_id).map(a=>({
      exam_attempt_id:a.exam_attempt_id,session_id:a.session_id,attempt_no:a.attempt_no,status:a.status,
      total_count:a.total_count,started_at:a.started_at,deadline_at:a.deadline_at,submitted_at:a.submitted_at,timed_out:a.timed_out,
      ...(a.status==='submitted'?{correct_count:a.correct_count}:{})
    }))
  };
}

export async function examMembers(member,query) {
  examStaff(member);
  const id=examUuid(query.session_id);
  await examOwnedSession(member,id);
  const [members,selected]=await Promise.all([
    allRows('school_members?is_active=eq.true&can_study=eq.true&select=member_id,member_name,can_study,is_active&order=member_name.asc'),
    db('school_exam_session_members?session_id=eq.'+id+'&select=member_id&limit=5000')
  ]);
  return {members,selected:selected.map(x=>x.member_id)};
}

export async function saveExamSession(member,p) {
  examStaff(member);
  const existing=p.session_id ? await examOwnedSession(member,p.session_id) : null;
  const set=examInt(p.set_no ?? 2,1,10,'ชุดข้อสอบ');
  if(!(await db('school_practice_sets?set_no=eq.'+set+'&select=set_no&limit=1'))[0]) fail('ไม่พบชุดข้อสอบที่เลือก',404);
  const rawSubject=String(p.subject_id||'ALL');
  const sid=rawSubject==='ALL'?null:subjectId(rawSubject);
  const duration=examInt(p.duration_minutes,1,600,'เวลาสอบ');
  const opens=examDate(p.opens_at,'เวลาเปิดสอบ');
  const closes=examDate(p.closes_at,'เวลาปิดสอบ');
  const startPolicy=['on_click','fixed'].includes(p.start_policy)?p.start_policy:'on_click';
  const fixed=startPolicy==='fixed'?examDate(p.fixed_start_at,'เวลาเริ่มพร้อมกัน',true):null;
  const resultPolicy=['manual','immediate','scheduled'].includes(p.result_policy)?p.result_policy:'manual';
  const resultRelease=resultPolicy==='scheduled'?examDate(p.result_release_at,'เวลาเปิดคะแนน',true):null;
  const answerPolicy=['manual','with_result','scheduled','never'].includes(p.answer_policy)?p.answer_policy:'manual';
  const answerRelease=answerPolicy==='scheduled'?examDate(p.answer_release_at,'เวลาเปิดเฉลย',true):null;
  const audience=['all_students','selected'].includes(p.audience_mode)?p.audience_mode:'all_students';
  const title=String(p.title||'').trim();
  if(!title||title.length>160) fail('กรุณาระบุชื่อรอบสอบไม่เกิน 160 ตัวอักษร');
  if(opens&&closes&&new Date(closes)<=new Date(opens)) fail('เวลาปิดสอบต้องอยู่หลังเวลาเปิดสอบ');
  if(fixed&&opens&&new Date(fixed)<new Date(opens)) fail('เวลาเริ่มพร้อมกันต้องไม่ก่อนเวลาเปิดสอบ');
  if(fixed&&closes&&new Date(fixed)>=new Date(closes)) fail('เวลาเริ่มพร้อมกันต้องอยู่ก่อนเวลาปิดสอบ');

  const payload={
    title,
    instructions:String(p.instructions||'').trim()||null,
    set_no:set,
    subject_id:sid,
    duration_minutes:duration,
    opens_at:opens,
    closes_at:closes,
    start_policy:startPolicy,
    fixed_start_at:fixed,
    allow_submit_early:examBoolean(p.allow_submit_early,true),
    require_all_answers:examBoolean(p.require_all_answers,false),
    allow_resume:examBoolean(p.allow_resume,true),
    max_attempts:examInt(p.max_attempts ?? 1,1,10,'จำนวนครั้งที่สอบ'),
    shuffle_questions:false,
    result_policy:resultPolicy,
    result_release_at:resultRelease,
    answer_policy:answerPolicy,
    answer_release_at:answerRelease,
    audience_mode:audience,
    is_published:examBoolean(p.is_published,false),
    updated_by:member.member_id,
    updated_at:new Date().toISOString()
  };

  if(existing) {
    const attemptCount=(await db('school_exam_attempts?session_id=eq.'+existing.session_id+'&select=exam_attempt_id&limit=1')).length;
    if(attemptCount) {
      const locked=['subject_id','set_no','duration_minutes','opens_at','closes_at','start_policy','fixed_start_at','allow_submit_early','require_all_answers','allow_resume','max_attempts','audience_mode'];
      if(locked.some(k=>JSON.stringify(existing[k]??null)!==JSON.stringify(payload[k]??null))) {
        fail('รอบสอบนี้มีผู้เริ่มสอบแล้ว เงื่อนไขหลักถูกล็อก กรุณาสร้างรอบใหม่หากต้องการเปลี่ยนเวลา/วิชา/สิทธิ์สอบ',409);
      }
    }
    const rows=await db('school_exam_sessions?session_id=eq.'+existing.session_id,'PATCH',payload,'return=representation');
    return safeExamSession(rows[0]);
  }

  payload.created_by=member.member_id;
  const rows=await db('school_exam_sessions','POST',payload,'return=representation');
  return safeExamSession(rows[0]);
}

export async function saveExamMembers(member,p) {
  examStaff(member);
  const s=await examOwnedSession(member,p.session_id);
  if(s.audience_mode!=='selected') fail('รอบสอบนี้เปิดให้นักเรียนทุกคนอยู่แล้ว');
  const ids=Array.isArray(p.member_ids)?[...new Set(p.member_ids.map(String))]:[];
  if(ids.length>1000) fail('เลือกรายชื่อนักเรียนมากเกินไป');

  const all=ids.length
    ? await allRows('school_members?is_active=eq.true&can_study=eq.true&select=member_id&order=member_id.asc')
    : [];
  const valid=new Set(all.map(x=>x.member_id));
  if(ids.some(id=>!valid.has(id))) fail('มีรายชื่อนักเรียนที่ไม่มีสิทธิ์ School หรือไม่ใช่นักเรียน');

  await db('school_exam_session_members?session_id=eq.'+s.session_id,'DELETE',undefined,'return=minimal');
  if(ids.length) {
    await db('school_exam_session_members','POST',ids.map(member_id=>({
      session_id:s.session_id,member_id,assigned_by:member.member_id
    })),'return=minimal');
  }
  return {session_id:s.session_id,count:ids.length};
}

export async function deleteExamSession(member,p) {
  examStaff(member);
  const s=await examOwnedSession(member,p.session_id);
  const attempt=(await db('school_exam_attempts?session_id=eq.'+s.session_id+'&select=exam_attempt_id&limit=1'))[0];
  if(attempt) fail('ลบรอบสอบที่มีผู้เริ่มสอบแล้วไม่ได้ ให้ปิดเผยแพร่แทน',409);
  await db('school_exam_sessions?session_id=eq.'+s.session_id,'DELETE',undefined,'return=minimal');
  return {session_id:s.session_id};
}


function examResultVisible(s,now=Date.now()) {
  if(s.result_policy==='immediate') return true;
  if(s.result_policy==='scheduled' && s.result_release_at) return now>=new Date(s.result_release_at).getTime();
  return false;
}

function examAnswerVisible(s,resultVisible,now=Date.now()) {
  if(s.answer_policy==='with_result') return resultVisible;
  if(s.answer_policy==='scheduled' && s.answer_release_at) return now>=new Date(s.answer_release_at).getTime();
  return false;
}

function safeRealExamAttempt(a,s) {
  const resultVisible=a.status==='submitted' && examResultVisible(s);
  return {
    exam_attempt_id:a.exam_attempt_id,session_id:a.session_id,attempt_no:a.attempt_no,status:a.status,
    total_count:a.total_count,started_at:a.started_at,deadline_at:a.deadline_at,submitted_at:a.submitted_at,
    timed_out:a.timed_out,updated_at:a.updated_at,result_visible:resultVisible,
    ...(resultVisible?{correct_count:a.correct_count}:{})
  };
}

async function examPaper(member,sessionId) {
  if(!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์เข้าสอบ',403);
  const id=examUuid(sessionId);
  const s=(await db('school_exam_sessions?session_id=eq.'+id+'&select='+EXAM_SESSION_FIELDS+'&limit=1'))[0];
  if(!s) fail('ไม่พบรอบสอบเตรียมทหาร',404);

  let a=(await db('school_exam_attempts?session_id=eq.'+id+'&member_id=eq.'+enc(member.member_id)+'&select='+EXAM_ATTEMPT_FIELDS+'&order=attempt_no.desc&limit=1'))[0];
  if(!a) fail('ยังไม่ได้เริ่มสอบรอบนี้',409);

  if(a.status==='draft' && Date.now()>=new Date(a.deadline_at).getTime()) {
    await db('rpc/school_exam_submit','POST',{p_member_id:member.member_id,p_exam_attempt_id:a.exam_attempt_id,p_timeout:true});
    a=(await db('school_exam_attempts?exam_attempt_id=eq.'+a.exam_attempt_id+'&select='+EXAM_ATTEMPT_FIELDS+'&limit=1'))[0];
  }

  const resultVisible=a.status==='submitted' && examResultVisible(s);
  const answerVisible=a.status==='submitted' && examAnswerVisible(s,resultVisible);
  const review=answerVisible?',answer_key,explanation,reasoning,source_question_ids':'';
  const subjectFilter=s.subject_id?'&subject_id=eq.'+enc(s.subject_id):'';
  const order=s.subject_id?'sort_order.asc,question_id.asc':'question_no.asc,sort_order.asc,question_id.asc';
  const rawQuestions=await db(
    'school_practice_questions?set_no=eq.'+s.set_no+subjectFilter+'&select='+QUESTION_FIELDS+review+'&order='+order+'&limit=1000'
  );
  const questions=rawQuestions.map(q=>({
    question_id:q.question_id,set_no:q.set_no,topic_id:q.topic_id,subject_id:q.subject_id,
    sort_order:q.sort_order,prompt:q.prompt,choices:q.choices,question_no:q.question_no,
    question_image_url:q.question_image_url,source_page:q.source_page,source_year:q.source_year,
    source_title:q.source_title,source_type:q.source_type,response_mode:'choice',
    ...(answerVisible?{
      answer_key:q.answer_key,explanation:q.explanation||'',reasoning:q.reasoning||'',
      source_question_ids:q.source_question_ids||[]
    }:{})
  }));
  const answerRows=await db(
    'school_exam_answers?exam_attempt_id=eq.'+a.exam_attempt_id+'&select=question_id,selected_answer'+(answerVisible?',is_correct':'')+'&order=question_id.asc&limit=1000'
  );
  const answers=answerRows.map(x=>({
    question_id:x.question_id,selected_answer:x.selected_answer,response:x.selected_answer,
    ...(answerVisible?{is_correct:x.is_correct}:{})
  }));

  return {
    server_time:new Date().toISOString(),
    exam_session:{...safeExamSession(s),result_visible:resultVisible,answer_visible:answerVisible},
    attempt:safeRealExamAttempt(a,s),
    set_no:s.set_no,subject_id:s.subject_id||'ALL',questions,answers,
    can_review:answerVisible
  };
}

export async function examOpen(member,query) {
  return examPaper(member,query.session_id);
}

export async function examStart(member,p) {
  if(!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์เข้าสอบ',403);
  const id=examUuid(p.session_id);
  try {
    await db('rpc/school_exam_start','POST',{p_member_id:member.member_id,p_session_id:id});
    return await examPaper(member,id);
  } catch(error) {
    const messages={
      PT403:['ไม่มีสิทธิ์เข้าสอบรอบนี้',403],PT404:['ไม่พบรอบสอบหรือคลังข้อสอบ',404],
      PT409:['ไม่สามารถเริ่มหรือกลับเข้าสอบรอบนี้ได้',409],PT410:['รอบสอบปิดแล้ว',410],
      PT425:['ยังไม่ถึงเวลาเริ่มสอบ',425]
    };
    if(messages[error.dbCode]) fail(...messages[error.dbCode]);
    throw error;
  }
}

export async function examSave(member,p) {
  if(!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์เข้าสอบ',403);
  const attempt=examUuid(p.exam_attempt_id,'รายการสอบ');
  if(typeof p.question_id!=='string'||!p.question_id||p.question_id.length>120) fail('ข้อสอบไม่ถูกต้อง');
  const value=Number(p.response);
  if(!Number.isInteger(value)||value<1||value>10) fail('กรุณาเลือกคำตอบที่ถูกต้อง');
  try {
    const result=await db('rpc/school_exam_save','POST',{
      p_member_id:member.member_id,p_exam_attempt_id:attempt,p_question_id:p.question_id,p_response:value
    });
    return {exam_attempt_id:result.exam_attempt_id,question_id:result.question_id,response:result.response_value};
  } catch(error) {
    const messages={
      PT400:['ข้อมูลคำตอบไม่ถูกต้อง',400],PT404:['ไม่พบข้อสอบหรือรายการสอบนี้',404],
      PT408:['หมดเวลาสอบแล้ว ระบบไม่รับคำตอบเพิ่มเติม',408],PT409:['ข้อสอบรอบนี้ถูกล็อกแล้ว',409]
    };
    if(messages[error.dbCode]) fail(...messages[error.dbCode]);
    throw error;
  }
}

export async function examSubmit(member,p) {
  if(!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์เข้าสอบ',403);
  const attempt=examUuid(p.exam_attempt_id,'รายการสอบ');
  const a=(await db('school_exam_attempts?exam_attempt_id=eq.'+attempt+'&member_id=eq.'+enc(member.member_id)+'&select=session_id&limit=1'))[0];
  if(!a) fail('ไม่พบรายการสอบนี้',404);
  try {
    await db('rpc/school_exam_submit','POST',{
      p_member_id:member.member_id,p_exam_attempt_id:attempt,p_timeout:Boolean(p.timeout)
    });
    return await examPaper(member,a.session_id);
  } catch(error) {
    const messages={
      PT404:['ไม่พบรายการสอบนี้',404],PT409:['ยังไม่สามารถส่งข้อสอบได้',409],
      PT422:['กรุณาตอบให้ครบทุกข้อก่อนส่ง',422]
    };
    if(messages[error.dbCode]) fail(...messages[error.dbCode]);
    throw error;
  }
}
