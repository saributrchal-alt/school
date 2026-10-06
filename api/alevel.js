import { body, requireMember, sameOrigin, fail, sendError } from '../lib/school.js';
import { alevelCatalog, alevelQuestions, saveALevelProgress } from '../lib/alevel.js';

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
      fail('ไม่พบรายการ A-Level',404);
    }

    if (req.method !== 'POST') fail('Method not allowed',405);
    sameOrigin(req);

    if (route === 'progress') {
      return res.status(200).json({ success:true, item:await saveALevelProgress(member, body(req)) });
    }
    fail('ไม่พบรายการ A-Level',404);
  } catch (error) {
    return sendError(res,error);
  }
}
