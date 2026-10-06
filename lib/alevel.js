import { db, fail } from './school.js';

const enc = encodeURIComponent;
const SUBJECTS = new Set(['AL61','AL64','AL65','AL66','AL82','AL81','AL70']);

export function alevelSubjectId(value) {
  const id = String(value || '');
  if (!SUBJECTS.has(id)) fail('วิชา A-Level ไม่ถูกต้อง');
  return id;
}

export function alevelTopicId(value) {
  const id = String(value || '');
  if (!/^AL(?:61|64|65|66|70|81|82)-\d{2}\.\d{2}$/.test(id)) fail('หัวข้อ A-Level ไม่ถูกต้อง');
  return id;
}

async function allRows(path) {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const batch = await db(`${path}&limit=1000&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  fail('ข้อมูล A-Level มากเกินขอบเขต กรุณาให้ผู้ดูแลตรวจสอบ', 503);
}

export async function alevelCatalog(member) {
  const [subjects, sources, chapters, topics, questions, progress] = await Promise.all([
    db('school_alevel_subjects?select=subject_id,subject_code,subject_name_th,sort_order,source_question_count_2568,duration_minutes&order=sort_order.asc&limit=100'),
    db('school_alevel_sources?select=source_id,year_be,subject_id,filename,pdf_page_count,question_count,source_title,source_url&order=subject_id.asc&limit=100'),
    db('school_alevel_chapters?select=chapter_id,subject_id,chapter_name_th,sort_order&order=subject_id.asc,sort_order.asc&limit=1000'),
    db('school_alevel_topics?select=topic_id,chapter_id,subject_id,topic_name_th,sort_order&order=subject_id.asc,chapter_id.asc,sort_order.asc&limit=2000'),
    allRows('school_alevel_questions?select=question_id,subject_id,primary_topic_id,year_be,question_no&order=subject_id.asc,question_no.asc'),
    db(`school_alevel_topic_progress?member_id=eq.${enc(member.member_id)}&select=topic_id,status&limit=2000`)
  ]);
  const topicCounts = new Map(), subjectCounts = new Map();
  for (const q of questions) {
    topicCounts.set(q.primary_topic_id, (topicCounts.get(q.primary_topic_id) || 0) + 1);
    subjectCounts.set(q.subject_id, (subjectCounts.get(q.subject_id) || 0) + 1);
  }
  const enrichedSubjects = subjects.map(s => ({
    ...s,
    imported_question_count: subjectCounts.get(s.subject_id) || 0,
    ready: (subjectCounts.get(s.subject_id) || 0) > 0
  }));
  return {
    subjects: enrichedSubjects,
    sources,
    chapters,
    topics: topics.map(t => ({ ...t, question_count: topicCounts.get(t.topic_id) || 0 })),
    progress,
    question_count: questions.length,
    source_question_count: sources.reduce((n,s)=>n + Number(s.question_count || 0),0)
  };
}

export async function alevelQuestions(member, query) {
  const topicId = alevelTopicId(query.topic_id);
  const topic = (await db(`school_alevel_topics?topic_id=eq.${enc(topicId)}&select=topic_id,topic_name_th,subject_id&limit=1`))[0];
  if (!topic) fail('ไม่พบหัวข้อ A-Level', 404);
  const staff = Boolean(member.can_teach || member.can_manage);
  const keys = staff ? ',answer_key,explanation,reasoning' : '';
  const questions = await db(
    `school_alevel_questions?primary_topic_id=eq.${enc(topicId)}&select=question_id,source_id,year_be,subject_id,question_no,question_type,prompt,choices,question_image_url,source_page${keys}&order=year_be.asc,question_no.asc&limit=1000`
  );
  return { topic, questions, can_review: staff };
}

export async function saveALevelProgress(member, payload) {
  if (!member.can_study) fail('บัญชีนี้ไม่มีสิทธิ์บันทึกการเรียน', 403);
  const topicId = alevelTopicId(payload.topic_id);
  const status = String(payload.status || '');
  if (!['not_started','in_progress','review','completed'].includes(status)) fail('สถานะการเรียนไม่ถูกต้อง');
  if (!(await db(`school_alevel_topics?topic_id=eq.${enc(topicId)}&select=topic_id&limit=1`))[0]) fail('ไม่พบหัวข้อ A-Level', 404);
  const rows = await db('school_alevel_topic_progress?on_conflict=member_id,topic_id','POST',{
    member_id: member.member_id,
    topic_id: topicId,
    status,
    updated_at: new Date().toISOString()
  },'resolution=merge-duplicates,return=representation');
  return rows[0];
}
