import { examResults } from '../lib/practice.js';
import { body, requireMember, sameOrigin, fail, sendError, understanding, saveUnderstanding } from '../lib/school.js';
import { alevelExamReview, releaseALevelExamResults, alevelCatalog, alevelQuestions, saveALevelProgress, alevelPracticeSummary, alevelPracticeSubject, alevelStudentResults, alevelReviewQueue, alevelPracticeTransaction, alevelExamSessions, alevelExamMembers, saveALevelExamSession, saveALevelExamMembers, deleteALevelExamSession, alevelExamOpen, alevelExamStart, alevelExamSave, alevelExamSubmit } from '../lib/alevel.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const member = await requireMember(req);
    const route = req.query?.route || 'catalog';

    if (req.method === 'GET') {
      if (route === 'understanding') return res.status(200).json({ success: true, ...await understanding(member, req.query, 'alevel') });
      if (route === 'catalog') {
        try {
          return res.status(200).json({ success:true, member, ...await alevelCatalog(member) });
        } catch (error) {
          if (error.code === 'school_schema_missing' && error.table?.startsWith('school_alevel_')) {
            return res.status(200).json({ success:true, member, ready:false, setup_required:true });
          }
          throw error;
        }
      }
      if (route === 'questions') {
        return res.status(200).json({ success:true, ...await alevelQuestions(member, req.query) });
      }
      if (route === 'summary') {
        try { return res.status(200).json({ success:true, ...await alevelPracticeSummary(member) }); }
        catch (error) {
          if (error.code === 'school_schema_missing' && error.table?.startsWith('school_alevel_practice_')) {
            return res.status(200).json({ success:true, ready:false, setup_required:true });
          }
          throw error;
        }
      }
      if (route === 'subject') return res.status(200).json({ success:true, ...await alevelPracticeSubject(member, req.query) });
      if (route === 'results') return res.status(200).json({ success:true, ...await alevelStudentResults(member, req.query) });
      if (route === 'review') {
        if (!member.can_manage) fail('เฉพาะผู้ดูแล School',403);
        return res.status(200).json({ success:true, attempts:await alevelReviewQueue() });
      }
      if (route === 'exam-sessions') return res.status(200).json({ success:true, ...await alevelExamSessions(member) });
      if (route === 'exam-members') return res.status(200).json({ success:true, ...await alevelExamMembers(member,req.query) });
      if (route === 'exam-results') return res.status(200).json({ success:true, ...await examResults(member,req.query,'school_alevel') });
      if (route === 'exam-review') return res.status(200).json({ success:true, ...await alevelExamReview(member,req.query) });
      if (route === 'exam-open') return res.status(200).json({ success:true, ...await alevelExamOpen(member,req.query) });
      fail('ไม่พบรายการ A-Level',404);
    }

    if (req.method !== 'POST') fail('Method not allowed',405);
    sameOrigin(req);
    if (route === 'understanding-save') return res.status(200).json({ success: true, item: await saveUnderstanding(member, body(req), 'alevel') });

    if (route === 'progress') {
      return res.status(200).json({ success:true, item:await saveALevelProgress(member, body(req)) });
    }
    if (['start','save','submit','grade'].includes(route)) {
      return res.status(200).json({ success:true, item:await alevelPracticeTransaction(route,member,body(req)) });
    }
    if (route === 'exam-release-results') return res.status(200).json({ success:true, item:await releaseALevelExamResults(member,body(req)) });
    if (route === 'exam-session-save') return res.status(200).json({ success:true, item:await saveALevelExamSession(member,body(req)) });
    if (route === 'exam-members-save') return res.status(200).json({ success:true, item:await saveALevelExamMembers(member,body(req)) });
    if (route === 'exam-session-delete') return res.status(200).json({ success:true, item:await deleteALevelExamSession(member,body(req)) });
    if (route === 'exam-start') return res.status(200).json({ success:true, ...await alevelExamStart(member,body(req)) });
    if (route === 'exam-save') return res.status(200).json({ success:true, item:await alevelExamSave(member,body(req)) });
    if (route === 'exam-submit') return res.status(200).json({ success:true, ...await alevelExamSubmit(member,body(req)) });
    fail('ไม่พบรายการ A-Level',404);
  } catch (error) {
    return sendError(res,error);
  }
}

