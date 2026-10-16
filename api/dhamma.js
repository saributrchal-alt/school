import {requireMember,sameOrigin,body,fail,sendError} from '../lib/school.js';
import {dhammaCatalog,dhammaQuestions,saveDhammaQuestion} from '../lib/dhamma.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try {
  const member=await requireMember(req);
  const route=req.query?.route||'catalog';
  if(req.method==='GET'){
   if(route==='catalog')return res.status(200).json({success:true,...await dhammaCatalog(member)});
   if(route==='questions')return res.status(200).json({success:true,...await dhammaQuestions(member,req.query)});
   fail('ไม่พบรายการการศึกษาธรรม',404);
  }
  if(req.method==='POST'){
   sameOrigin(req);
   if(route==='question-save')return res.status(200).json({success:true,item:await saveDhammaQuestion(member,body(req))});
  }
  fail('Method not allowed',405);
 }catch(error){return sendError(res,error);}
}
