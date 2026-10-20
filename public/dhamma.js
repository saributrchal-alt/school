const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PDF_2566='https://www.gongtham.net/docs/2566/ans2566_dsc-dst.pdf';
const NAKTHAM_TRI_YEARS=[2567,2566,2565,2563,2562];
const NAKTHAM_TRI_PAGES={2562:[14,24],2563:[15,24],2565:[19,29],2566:[37,46],2567:[45,54]};
const LEVELS=[['tri','ชั้นตรี'],['tho','ชั้นโท'],['ek','ชั้นเอก']];
const AUDIENCES=[['primary','ระดับประถมศึกษา'],['secondary','ระดับมัธยมศึกษา'],['general','ระดับอุดมศึกษาและประชาชนทั่วไป']];
const SUBJECTS=[['essay','เรียงความแก้กระทู้ธรรม'],['dhamma','วิชาธรรม'],['buddha','พุทธประวัติ'],['vinaya','วินัย / ศาสนพิธี']];
const SRC_PAGES={
  naktham:{tri:[37,46],tho:[47,58],ek:[59,70]},
  thammasuksa:{
    tri:{primary:[71,96],secondary:[97,122],general:[123,148]},
    tho:{primary:[149,174],secondary:[175,200],general:[201,226]},
    ek:{primary:[227,252],secondary:[253,278],general:[279,304]}
  }
};
const labelOf=(items,id)=>items.find(x=>x[0]===id)?.[1]||id;
const safeMedia=url=> /^https:\/\/media\.nathoeng\.com\/uploads\/school\/[A-Za-z0-9/_.-]+\.(png|jpe?g|webp|gif)(\?v=[A-Za-z0-9_-]{1,40})?$/i.test(url||'');

export function renderDhamma({main,track,member,api,notice,onHome,onEdit}) {
 const admin=Boolean(member.can_manage);
 const stream=track==='naktham'?'naktham':'thammasuksa';
 const title=stream==='naktham'?'นักธรรม (นักบวช)':'ธรรมศึกษา (บุคคลทั่วไป)';
 const stage={level:'',audience:'',subject:'',year:2566,revealed:new Set(),choices:new Map(),questions:[],counts:{},blueprintCounts:{},draftQuestion:null};
 const mount=()=>{
  main.innerHTML='<section class="hero dhamma-hero '+(stream==='naktham'?'dhamma-monk':'dhamma-lay')+'">'+
   '<button type="button" class="hero-back" data-dhamma-home>← กลับประเภทการเรียน</button>'+
   '<span class="eyebrow">NATHOENG SCHOOL · DHAMMA STUDIES</span><h1>'+title+'</h1>'+
   '<p>ศึกษาข้อสอบธรรมสนามหลวงตามระดับชั้น · '+(stream==='naktham'?'ชั้นตรีมีคลังปี ๒๕๖๒, ๒๕๖๓, ๒๕๖๕–๒๕๖๗ (เว้น ๒๕๖๔)':'คลังต้นฉบับ พ.ศ. ๒๕๖๖')+' พร้อมแนวเฉลย</p></section>'+
   '<div id="dhamma-content" class="dhamma-content"></div>';
  renderLevels();
  loadCounts();
 };
 const root=()=>main.querySelector('#dhamma-content');
 const pages=()=>{
  const p=stream==='naktham'?(stage.level==='tri'?NAKTHAM_TRI_PAGES[stage.year]:SRC_PAGES.naktham[stage.level]):SRC_PAGES.thammasuksa[stage.level]?.[stage.audience];
  return p||null;
 };
 const sourceLink=()=>{
  const range=pages();
  if(stream==='naktham'&&stage.level==='tri'&&stage.year!==2566)
   return '<p class="dhamma-source">ต้นฉบับสำนักงานแม่กองธรรมสนามหลวง พ.ศ. '+stage.year+' · หน้า PDF '+range[0]+'–'+range[1]+' · ต้นฉบับบันทึกในคลังเอกสารของครู</p>';
  return range?'<p class="dhamma-source">ต้นฉบับจากสำนักงานแม่กองธรรมสนามหลวง พ.ศ. 2566 · หน้าหนังสือ '+range[0]+'–'+range[1]+
   ' <a href="'+PDF_2566+'#page='+range[0]+'" target="_blank" rel="noopener noreferrer">เปิดต้นฉบับ PDF ↗</a></p>':'';
 };
 const blueprintEnabled=()=>stream==='naktham'&&stage.level==='tri';
 function yearPicker(){
  if(!blueprintEnabled())return '';
  return '<label class="dhamma-year-select">เลือกปีข้อสอบนักธรรมตรี <select data-dhamma-year>'+
   NAKTHAM_TRI_YEARS.map(y=>'<option value="'+y+'" '+(stage.year===y?'selected':'')+'>พ.ศ. '+y+'</option>').join('')+
   '</select></label>';
 }
 const blueprintCount=(level,audience,subject)=>stage.blueprintCounts[[stream,level,audience||'monk',stage.year,subject].join('/')]||0;
 async function loadCounts(){
  try{
   const result=await api('/api/dhamma?route=catalog');
   if(root()){stage.counts=result.counts||{};stage.blueprintCounts=result.blueprint_counts||{};}
   if(root()&&!stage.subject){if(!stage.level)renderLevels();else if(!stage.audience)renderAudiences();else renderSubjects();}
  }catch(err){if(root())notice('ข้อมูลคลังธรรม: '+err.message);}
 }
 const itemCount=(level,audience,subject)=>Math.max(stage.counts[[stream,level,audience||'monk',stage.year,subject].join('/')]||0,blueprintCount(level,audience,subject));
 const levelCount=(level,audience)=>SUBJECTS.reduce((sum,[id])=>sum+itemCount(level,audience,id),0);
 const courseCount=(level)=>stream==='naktham'?levelCount(level,'monk'):AUDIENCES.reduce((sum,[aud])=>sum+levelCount(level,aud),0);
 function renderLevels(){
  stage.level='';stage.audience='';stage.subject='';
  const r=root();if(!r)return;
  r.innerHTML='<div class="dhamma-section-heading"><span class="eyebrow">เลือกชั้นการศึกษา</span><h2>'+title+'</h2>'+
   '<p>'+ (stream==='naktham'?'สำหรับพระภิกษุและสามเณร':'สำหรับฆราวาสและผู้สนใจศึกษาพระพุทธศาสนา')+
   ' · ข้อสอบต้นฉบับตามปีการศึกษา</p></div>'+
   '<div class="dhamma-level-grid">'+LEVELS.map(([id,label])=>
    '<button type="button" class="dhamma-level-card" data-dhamma-level="'+id+'"><span class="dhamma-level-symbol" aria-hidden="true">'+({tri:'๑',tho:'๒',ek:'๓'}[id])+'</span>'+
    '<span><strong>'+(stream==='naktham'?'นักธรรม':'ธรรมศึกษา')+label+'</strong><small>'+courseCount(id)+' ข้อในระบบ · เปิดคลังรายวิชา</small></span><b>→</b></button>').join('')+'</div>'+
    '<p class="dhamma-source">แหล่งข้อมูล: ปัญหาและเฉลยข้อสอบ นักธรรมชั้นตรี–โท–เอก และธรรมศึกษาทุกชั้น พ.ศ. ๒๕๖๖ · <a href="'+PDF_2566+'" target="_blank" rel="noopener noreferrer">เปิดเอกสารสำนักงานแม่กองธรรมสนามหลวง ↗</a></p>';
 }
 function renderAudiences(){
  stage.audience='';stage.subject='';
  if(stream==='naktham'){stage.audience='monk';renderSubjects();return;}
  const r=root();if(!r)return;
  r.innerHTML='<div class="dhamma-breadcrumb"><button type="button" data-dhamma-back="levels">← เลือกชั้นใหม่</button></div>'+
    '<div class="dhamma-section-heading"><span class="eyebrow">ธรรมศึกษา '+labelOf(LEVELS,stage.level)+'</span><h2>เลือกกลุ่มผู้เรียน</h2><p>แบ่งตามระดับการศึกษาตามข้อสอบสนามหลวง พ.ศ. ๒๕๖๖</p></div>'+
    '<div class="dhamma-level-grid">'+AUDIENCES.map(([id,label])=>
      '<button type="button" class="dhamma-level-card" data-dhamma-audience="'+id+'"><span><strong>'+label+'</strong><small>'+levelCount(stage.level,id)+' ข้อในระบบ</small></span><b>→</b></button>').join('')+'</div>';
 }
 function renderSubjects(){
  stage.subject='';
  const r=root();if(!r)return;
  const audienceText=stream==='naktham'?'พระภิกษุและสามเณร':labelOf(AUDIENCES,stage.audience);
  r.innerHTML='<div class="dhamma-breadcrumb"><button type="button" data-dhamma-back="'+(stream==='naktham'?'levels':'audiences')+'">← ย้อนกลับ</button></div>'+
   '<div class="dhamma-section-heading"><span class="eyebrow">ปีการศึกษา '+stage.year+'</span><h2>'+title+' · '+labelOf(LEVELS,stage.level)+'</h2><p>'+audienceText+' · เลือกวิชาที่ต้องการศึกษา</p></div>'+yearPicker()+
   '<div class="dhamma-subject-grid">'+SUBJECTS.map(([id,label])=>
     '<button type="button" class="dhamma-subject-card" data-dhamma-subject="'+id+'"><strong>'+label+'</strong><small>'+itemCount(stage.level,stage.audience,id)+' หัวข้อใน Blueprint/คลังข้อสอบ</small><span>ศึกษาและทบทวนเฉลย →</span></button>').join('')+'</div>'+sourceLink();
 }
 function studyCard(q){
  const revealed=stage.revealed.has(q.question_id),response=stage.choices.get(q.question_id),choice= q.question_type==='choice';
  const key=q.answer_key;
  const options=choice?'<fieldset class="dhamma-options"><legend>เลือกคำตอบแล้วกดตรวจ</legend>'+(q.choices||[]).map((text,i)=>
    '<label><input type="radio" name="dhamma-choice-'+esc(q.question_id)+'" value="'+(i+1)+'" data-dhamma-choice="'+esc(q.question_id)+'" '+(Number(response)===i+1?'checked':'')+' '+(revealed?'disabled':'')+'>'+String.fromCharCode(3585+i)+'. '+esc(text)+'</label>').join('')+'</fieldset>':
    '<label class="dhamma-selfanswer">ลองเขียนคำตอบก่อนดูเฉลย<textarea rows="3" placeholder="ฝึกตอบด้วยตนเอง (ไม่บันทึกคำตอบ)"></textarea></label>';
  const answer=revealed?'<section class="dhamma-answer"><h4>แนวเฉลยจากต้นฉบับ พ.ศ. '+esc(q.year_be)+'</h4>'+
    (choice?'<p class="dhamma-check-result">'+(Number(response)===Number(key)?'✓ ตอบถูกต้อง':'ควรทบทวนอีกครั้ง · เฉลยคือข้อ '+esc(key))+'</p>':'')+
    '<p>'+esc(q.answer_text||'ไม่มีคำตอบจากต้นฉบับที่บันทึกไว้')+'</p>'+
    (q.explanation?'<h4>คำอธิบายเพิ่มเติม</h4><p>'+esc(q.explanation)+'</p>':'')+
    (q.reasoning?'<h4>ข้อสังเกต / ความรู้เพิ่มเติม</h4><p>'+esc(q.reasoning)+'</p>':'')+
    (safeMedia(q.explanation_image_url)?'<img src="'+esc(q.explanation_image_url)+'" alt="ภาพประกอบเฉลย" loading="lazy">':'')+'</section>':'';
  const draftNote=q.is_published?'':'<span class="dhamma-draft">ฉบับรอผู้ดูแลตรวจ</span>';
  return '<article class="dhamma-question"><div class="dhamma-question-heading"><strong>ข้อ '+esc(q.question_no)+'</strong>'+draftNote+
     '<small>พ.ศ. '+esc(q.year_be)+' · หน้า '+esc(q.source_pdf_page||'—')+'</small></div>'+
    '<p class="dhamma-prompt">'+esc(q.prompt)+'</p>'+
    (safeMedia(q.question_image_url)?'<img class="dhamma-question-image" src="'+esc(q.question_image_url)+'" alt="ภาพประกอบโจทย์" loading="lazy">':'')+
    options+
    '<div class="dhamma-actions"><button type="button" class="secondary" data-dhamma-reveal="'+esc(q.question_id)+'" '+(revealed?'disabled':'')+'>'+
      (revealed?'เปิดเฉลยแล้ว':choice?'ตรวจคำตอบ':'ดูแนวเฉลย')+'</button>'+
      (admin?'<button type="button" class="secondary" data-dhamma-edit-explanation="'+esc(q.question_id)+'">แก้ไขคำอธิบายเฉลย</button>':'')+
      (admin&&!q.is_published?'<button type="button" class="secondary" data-dhamma-edit-draft="'+esc(q.question_id)+'">แก้ไขร่าง</button>':'')+
    '</div>'+answer+'</article>';
 }
 async function renderQuestions(){
  const r=root();if(!r)return;
  const a=stage.audience,sid=stage.subject,l=stage.level,year=stage.year;
  r.innerHTML='<div class="dhamma-breadcrumb"><button type="button" data-dhamma-back="subjects">← กลับวิชา</button></div>'+
   '<div class="dhamma-section-heading"><span class="eyebrow">ข้อสอบสนามหลวง พ.ศ. '+year+'</span><h2>'+labelOf(SUBJECTS,sid)+'</h2><p>'+title+' '+labelOf(LEVELS,l)+(stream==='thammasuksa'?' · '+labelOf(AUDIENCES,a):'')+'</p></div>'+yearPicker()+
   '<div id="dhamma-question-list" role="status">กำลังโหลดข้อสอบ…</div>';
  try{
   const params=new URLSearchParams({track:stream,level:l,audience:a,subject_id:sid,year_be:year});
   const [result,blueprint]=await Promise.all([
    api('/api/dhamma?route=questions&'+params),
    blueprintEnabled()?api('/api/dhamma?route=blueprint&'+params):Promise.resolve({items:[]})
   ]);
   if(!root()||stage.subject!==sid||stage.level!==l||stage.audience!==a||stage.year!==year)return;
   stage.questions=result.questions;stage.revealed.clear();stage.choices.clear();
   const holder=root().querySelector('#dhamma-question-list');
   const outline=blueprint.items?.length?'<section class="dhamma-blueprint"><h3>Blueprint จำแนกหัวข้อ · พ.ศ. '+year+'</h3>'+
    '<p>หัวข้อตามข้อสอบจริง '+blueprint.items.length+' รายการ · ข้อที่ยังไม่ผ่านการตรวจต้นฉบับจะไม่เผยแพร่เป็นแบบฝึก</p>'+
    '<ol>'+blueprint.items.map(x=>'<li><strong>ข้อ '+esc(x.question_no)+': '+esc(x.topic_name_th)+'</strong>'+
    '<small>'+esc(x.unit_name_th)+' · '+esc(x.skill_name_th)+' · หน้า PDF '+esc(x.source_pdf_page||'—')+
    (admin&&x.review_status!=='verified'?' · รอตรวจต้นฉบับ':'')+'</small></li>').join('')+'</ol></section>':'';
   holder.innerHTML=outline+(admin?'<button type="button" class="secondary dhamma-add" data-dhamma-add>+ เพิ่มข้อสอบ/เฉลยของวิชานี้</button>':'')+
    (stage.questions.length?stage.questions.map(studyCard).join(''):
      '<div class="dhamma-empty"><strong>ยังไม่มีข้อสอบที่เผยแพร่ในระบบสำหรับวิชานี้</strong><p>ผู้เรียนสามารถดูหัวข้อจาก Blueprint ได้ก่อน เมื่อครูตรวจทานและอนุมัติข้อสอบแล้วจึงจะเปิดแบบฝึกพร้อมเฉลย</p></div>')+sourceLink();
  }catch(err){const holder=root()?.querySelector('#dhamma-question-list');if(holder)holder.textContent=err.message;}
 }
 function showQuestionForm(q){
  stage.draftQuestion=q||null;
  const r=root(),box=r?.querySelector('#dhamma-question-list');if(!box)return;
  const formNode=r.querySelector('#dhamma-admin-form');
  formNode?.remove();
  const last=stage.questions.reduce((n,x)=>Math.max(n,Number(x.question_no)||0),0);
  const obj=q||{question_no:last+1,question_type:stage.subject==='essay'||stream==='naktham'?'essay':'choice',prompt:'',answer_text:'',choices:[],source_pdf_page:pages()?.[0],is_published:false};
  box.insertAdjacentHTML('afterbegin','<form id="dhamma-admin-form" class="dhamma-editor"><h3>เพิ่ม/แก้ร่างข้อสอบ ปี ๒๕๖๖</h3>'+
    '<label>เลขข้อ<input name="question_no" type="number" min="1" max="100" required value="'+esc(obj.question_no)+'" '+(q?'readonly':'')+'></label>'+
    '<label>ชนิดข้อสอบ<select name="question_type"><option value="essay" '+(obj.question_type==='essay'?'selected':'')+'>อัตนัย / เรียงความ</option>'+
    '<option value="choice" '+(obj.question_type==='choice'?'selected':'')+'>ปรนัยเลือกคำตอบ</option></select></label>'+
    '<label>โจทย์<textarea name="prompt" rows="4" required maxlength="12000">'+esc(obj.prompt)+'</textarea></label>'+
    '<label>ตัวเลือก (ข้อปรนัย: หนึ่งตัวเลือกต่อหนึ่งบรรทัด)<textarea name="choices" rows="4">'+esc((obj.choices||[]).join('\n'))+'</textarea></label>'+
    '<label>ข้อที่ถูกต้อง (ข้อปรนัย: เลข 1–10)<input name="answer_key" type="number" min="1" max="10" value="'+esc(obj.answer_key||'')+'"></label>'+
    '<label>คำเฉลยต้นฉบับ<textarea name="answer_text" rows="7" maxlength="12000">'+esc(obj.answer_text||'')+'</textarea></label>'+
    '<label>PDF หน้าต้นฉบับ<input name="source_pdf_page" type="number" min="1" max="999" value="'+esc(obj.source_pdf_page||'')+'"></label>'+
    '<label>URL ภาพโจทย์จาก Media (ไม่จำเป็น)<input name="question_image_url" type="url" value="'+esc(obj.question_image_url||'')+'"></label>'+
    '<label class="dhamma-publish-label"><input name="is_published" type="checkbox" '+(obj.is_published?'checked':'')+'> ตรวจต้นฉบับแล้ว — เปิดให้นักเรียนฝึก</label>'+
    '<div class="dhamma-actions"><button type="submit" class="practice-primary">บันทึกข้อสอบ</button><button type="button" class="secondary" data-dhamma-cancel>ยกเลิก</button></div>'+
    '<p role="status" id="dhamma-save-status"></p></form>');
  r.querySelector('#dhamma-admin-form')?.scrollIntoView({block:'nearest'});
 }
 mount();
 // All event listeners stay attached to this particular DOM instance and vanish when leaving.
 const view=main.querySelector('.dhamma-content');
 main.querySelector('.dhamma-hero [data-dhamma-home]')?.addEventListener('click',onHome);
 view?.addEventListener('change',event=>{
  const yearSelect=event.target.closest('[data-dhamma-year]');
  if(yearSelect){const y=Number(yearSelect.value);if(NAKTHAM_TRI_YEARS.includes(y)){stage.year=y;stage.subject?renderQuestions():renderSubjects();}return;}
  const el=event.target.closest('[data-dhamma-choice]');
  if(el)stage.choices.set(el.dataset.dhammaChoice,Number(el.value));
 });
 view?.addEventListener('click',async event=>{
  const t=event.target.closest('button');
  if(!t)return;
  if(t.hasAttribute('data-dhamma-back')){
   const where=t.dataset.dhammaBack;
   if(where==='levels')renderLevels();else if(where==='audiences')renderAudiences();else if(where==='subjects')renderSubjects();return;
  }
  if(t.dataset.dhammaLevel){stage.level=t.dataset.dhammaLevel;stage.year=(stream==='naktham'&&stage.level==='tri')?2567:2566;renderAudiences();return;}
  if(t.dataset.dhammaAudience){stage.audience=t.dataset.dhammaAudience;renderSubjects();return;}
  if(t.dataset.dhammaSubject){stage.subject=t.dataset.dhammaSubject;await renderQuestions();return;}
  if(t.dataset.dhammaReveal){
   const id=t.dataset.dhammaReveal,q=stage.questions.find(x=>x.question_id===id);
   if(!q)return;
   if(q.question_type==='choice'&&!stage.choices.has(id)){notice('กรุณาเลือกคำตอบก่อนตรวจ');return;}
   stage.revealed.add(id);
   const card=t.closest('.dhamma-question'); if(card)card.outerHTML=studyCard(q); return;
  }
  if(t.dataset.dhammaEditExplanation){onEdit(t.dataset.dhammaEditExplanation);return;}
  if(t.hasAttribute('data-dhamma-add')){showQuestionForm(null);return;}
  if(t.dataset.dhammaEditDraft){showQuestionForm(stage.questions.find(x=>x.question_id===t.dataset.dhammaEditDraft));return;}
  if(t.hasAttribute('data-dhamma-cancel')){view.querySelector('#dhamma-admin-form')?.remove();return;}
 });
 view?.addEventListener('submit',async event=>{
  const f=event.target.closest('#dhamma-admin-form');
  if(!f||!admin)return;event.preventDefault();
  const btn=f.querySelector('[type="submit"]'),status=f.querySelector('#dhamma-save-status');
  const p={
   track:stream,level:stage.level,audience:stage.audience,subject_id:stage.subject,year_be:stage.year,
   question_no:Number(f.elements.question_no.value),question_type:f.elements.question_type.value,
   prompt:f.elements.prompt.value,choices:f.elements.choices.value.split('\n').map(s=>s.trim()).filter(Boolean),
   answer_key:f.elements.answer_key.value||null,answer_text:f.elements.answer_text.value,
   source_pdf_page:f.elements.source_pdf_page.value||null,question_image_url:f.elements.question_image_url.value.trim(),
   is_published:f.elements.is_published.checked
  };
  btn.disabled=true;status.textContent='กำลังบันทึก…';
  try{
   await api('/api/dhamma?route=question-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
   notice('บันทึกข้อสอบทางธรรมเรียบร้อย');await renderQuestions();loadCounts();
  }catch(err){status.textContent=err.message;btn.disabled=false;}
 });
}
