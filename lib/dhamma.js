import {db,fail} from './school.js';

const enc=encodeURIComponent;
const VALID_TRACKS=new Set(['naktham','thammasuksa']);
const VALID_LEVELS=new Set(['tri','tho','ek']);
const VALID_AUDIENCES=new Set(['monk','primary','secondary','general']);
const VALID_SUBJECTS=new Set(['essay','dhamma','buddha','vinaya']);
const officialMedia=/^https:\/\/media\.nathoeng\.com\/uploads\/school\/[A-Za-z0-9/_.-]+\.(?:png|jpe?g|webp|gif)(?:\?v=[A-Za-z0-9_-]{1,40})?$/i;
const validYear=value=>{const n=Number(value||2566);if(!Number.isInteger(n)||n<2500||n>2700)fail('ปีข้อสอบไม่ถูกต้อง');return n;};
const isAdmin=m=>Boolean(m?.is_active&&m.can_manage);
function course(p){
 const track=String(p.track||''),level=String(p.level||''),audience=String(p.audience||'');
 if(!VALID_TRACKS.has(track)||!VALID_LEVELS.has(level)||!VALID_AUDIENCES.has(audience)||
  (track==='naktham'?audience!=='monk':audience==='monk'))fail('หมวดการศึกษาธรรมไม่ถูกต้อง');
 return {track,level,audience};
}
function subject(v){
 if(!VALID_SUBJECTS.has(v))fail('วิชาธรรมไม่ถูกต้อง');
 return v;
}
const columns='question_id,track,level,audience,subject_id,set_no,year_be,question_no,question_type,prompt,choices,answer_key,answer_text,explanation,reasoning,question_image_url,explanation_image_url,source_pdf_page,is_published';
const safeId=v=>{
 if(typeof v!=='string'||!/^[A-Z0-9_-]{6,120}$/.test(v))fail('รหัสข้อสอบไม่ถูกต้อง');
 return v;
};

export async function dhammaCatalog(member){
 const filter=isAdmin(member)?'':'is_published=eq.true&';
 const rows=await db('school_dhamma_questions?'+filter+'select=track,level,audience,subject_id,year_be,is_published&limit=5000');
 return {counts:rows.reduce((acc,row)=>{
   const k=[row.track,row.level,row.audience,row.year_be,row.subject_id].join('/');
   acc[k]=(acc[k]||0)+1;return acc;
 },{}),year_be:2566};
}
export async function dhammaQuestions(member,query={}){
 const c=course(query),sid=subject(query.subject_id),year=validYear(query.year_be);
 const where='track=eq.'+c.track+'&level=eq.'+c.level+'&audience=eq.'+c.audience+
   '&subject_id=eq.'+sid+'&year_be=eq.'+year;
 const pub=isAdmin(member)?'':'&is_published=eq.true';
 const rows=await db('school_dhamma_questions?'+where+pub+'&select='+columns+
   '&order=question_no.asc&limit=100');
 // The Dharma section is a study/review bank, not a real-exam session.
 return {questions:rows,year_be:year,course:c,subject_id:sid,admin:isAdmin(member)};
}
export async function saveDhammaQuestion(member,p){
 if(!isAdmin(member))fail('เฉพาะผู้ดูแล School เพิ่มข้อสอบทางธรรมได้',403);
 const c=course(p),sid=subject(p.subject_id),year=validYear(p.year_be),no=Number(p.question_no);
 if(!Number.isInteger(no)||no<1||no>100)fail('เลขข้อสอบไม่ถูกต้อง');
 const type=String(p.question_type||'essay');
 if(!['essay','choice'].includes(type))fail('ชนิดข้อสอบไม่ถูกต้อง');
 const prompt=String(p.prompt||'').trim(),answerText=String(p.answer_text||'').trim();
 if(prompt.length<5||prompt.length>12000||answerText.length>12000)fail('ข้อความโจทย์หรือเฉลยไม่ถูกต้อง');
 const rawChoices=p.choices??[];
 if(!Array.isArray(rawChoices)||rawChoices.length>10||rawChoices.some(x=>typeof x!=='string'||x.length>1500))fail('ตัวเลือกไม่ถูกต้อง');
 const choices=type==='choice'?rawChoices.map(x=>x.trim()).filter(Boolean):[];
 const key=p.answer_key===''||p.answer_key===null?null:Number(p.answer_key);
 if(type==='choice'&&(choices.length<2||!Number.isInteger(key)||key<1||key>choices.length))fail('ข้อสอบปรนัยต้องมีคำตอบและตัวเลือกถูกต้อง');
 const correct=type==='essay'?null:key;
 if(p.is_published&&(!answerText||(type==='choice'&&!correct)))fail('กรุณากรอกเฉลยก่อนเผยแพร่');
 const page=p.source_pdf_page===''||p.source_pdf_page==null?null:Number(p.source_pdf_page);
 if(page!==null&&(!Number.isInteger(page)||page<1||page>999))fail('หน้าต้นฉบับไม่ถูกต้อง');
 const media=String(p.question_image_url||'').trim();
 if(media&&(!officialMedia.test(media)||media.length>500))fail('ภาพโจทย์ต้องมาจาก Media ของ School');
 const questionId='DH-'+[c.track==='naktham'?'NT':'DS',c.level.toUpperCase(),c.audience.toUpperCase(),sid.toUpperCase(),year,String(no).padStart(3,'0')].join('-');
 const existing=(await db('school_dhamma_questions?question_id=eq.'+enc(questionId)+'&select=question_id,is_published&limit=1'))[0];
 if(existing?.is_published)fail('ข้อสอบเผยแพร่แล้ว แก้ไขเฉพาะคำอธิบายผ่านเครื่องมือแก้เฉลย',409);
 const row={
  question_id:questionId,...c,subject_id:sid,set_no:1,year_be:year,question_no:no,
  question_type:type,prompt,choices,answer_key:correct,answer_text:answerText,
  question_image_url:media||null,source_pdf_page:page,
  is_published:p.is_published===true,updated_by:member.member_id,updated_at:new Date().toISOString()
 };
 const result=await db(existing?'school_dhamma_questions?question_id=eq.'+enc(questionId):'school_dhamma_questions',
  existing?'PATCH':'POST',row);
 if(result.length!==1)fail('บันทึกข้อสอบไม่สำเร็จ กรุณาตรวจรายการอีกครั้ง',503);
 return {question_id:questionId,is_published:result[0].is_published};
}
