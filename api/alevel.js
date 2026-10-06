import { body, requireMember, sameOrigin, fail, sendError } from '../lib/school.js';
import { alevelCatalog, alevelQuestions, saveALevelProgress, alevelPracticeSummary, alevelPracticeSubject, alevelStudentResults, alevelReviewQueue, alevelPracticeTransaction } from '../lib/alevel.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const member = await requireMember(req);
    const route = req.query?.route || 'catalog';

    if (req.method === 'GET') {
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
      fail('ไม่พบรายการ A-Level',404);
    }

    if (req.method !== 'POST') fail('Method not allowed',405);
    sameOrigin(req);

    if (route === 'progress') {
      return res.status(200).json({ success:true, item:await saveALevelProgress(member, body(req)) });
    }
    if (['start','save','submit','grade'].includes(route)) {
      return res.status(200).json({ success:true, item:await alevelPracticeTransaction(route,member,body(req)) });
    }
    fail('ไม่พบรายการ A-Level',404);
  } catch (error) {
    return sendError(res,error);
  }
}
