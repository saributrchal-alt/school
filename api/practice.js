import { body, requireMember, sameOrigin, fail, sendError } from '../lib/school.js';
import { examResults, examReview, releaseExamResults, summary, subject, reviewQueue, studentResults, transaction, examSessions, examMembers, saveExamSession, saveExamMembers, deleteExamSession, examOpen, examStart, examSave, examSubmit } from '../lib/practice.js';

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
      if (route === 'exam-sessions') return res.status(200).json({ success:true, ...await examSessions(member) });
      if (route === 'exam-members') return res.status(200).json({ success:true, ...await examMembers(member,req.query) });
      if (route === 'exam-results') return res.status(200).json({ success:true, ...await examResults(member,req.query) });
      if (route === 'exam-review') return res.status(200).json({ success:true, ...await examReview(member,req.query) });
      if (route === 'exam-open') return res.status(200).json({ success:true, ...await examOpen(member,req.query) });
      fail('ไม่พบรายการ', 404);
    }
    if (req.method !== 'POST') fail('Method not allowed', 405);
    sameOrigin(req);
    if (['start','save','submit','grade'].includes(route)) return res.status(200).json({ success:true, item:await transaction(route,member,body(req)) });
    if (route === 'exam-release-results') return res.status(200).json({ success:true, item:await releaseExamResults(member,body(req)) });
    if (route === 'exam-session-save') return res.status(200).json({ success:true, item:await saveExamSession(member,body(req)) });
    if (route === 'exam-members-save') return res.status(200).json({ success:true, item:await saveExamMembers(member,body(req)) });
    if (route === 'exam-session-delete') return res.status(200).json({ success:true, item:await deleteExamSession(member,body(req)) });
    if (route === 'exam-start') return res.status(200).json({ success:true, ...await examStart(member,body(req)) });
    if (route === 'exam-save') return res.status(200).json({ success:true, item:await examSave(member,body(req)) });
    if (route === 'exam-submit') return res.status(200).json({ success:true, ...await examSubmit(member,body(req)) });
    fail('ไม่พบรายการ',404);
  } catch (error) { return sendError(res, error); }
}

