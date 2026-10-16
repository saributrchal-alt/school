import { createPractice, learningLabels, topicLearningRoad, recordLearningProgress } from './practice.js';
import { renderDhamma } from './dhamma.js';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const dialog = document.querySelector('#detail');
const labels = learningLabels;
const learningAreas = [
  {
    id:'primary',
    title:'เรียน ชั้นประถม',
    description:'เลือกชั้นเรียนระดับประถมศึกษา',
    backgroundFile:'Student in Ban Khung Taphao School 1.JPG',
    levels:[
      ['p1','ประถมศึกษาปีที่ 1'],['p2','ประถมศึกษาปีที่ 2'],['p3','ประถมศึกษาปีที่ 3'],
      ['p4','ประถมศึกษาปีที่ 4'],['p5','ประถมศึกษาปีที่ 5'],['p6','ประถมศึกษาปีที่ 6']
    ]
  },
  {
    id:'secondary',
    title:'เรียน ชั้นมัธยม',
    description:'เลือกชั้นเรียนระดับมัธยมศึกษา',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/hischool.png',
    levels:[
      ['m1','มัธยมศึกษาปีที่ 1'],['m2','มัธยมศึกษาปีที่ 2'],['m3','มัธยมศึกษาปีที่ 3'],
      ['m4','มัธยมศึกษาปีที่ 4'],['m5','มัธยมศึกษาปีที่ 5'],['m6','มัธยมศึกษาปีที่ 6']
    ]
  },
  {
    id:'vocational-certificate',
    title:'เรียน ปวช.',
    description:'ประกาศนียบัตรวิชาชีพ',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/pwch.png',
    levels:[['vc1','ปวช. 1'],['vc2','ปวช. 2'],['vc3','ปวช. 3']]
  },
  {
    id:'higher-vocational',
    title:'เรียน ปวส.',
    description:'ประกาศนียบัตรวิชาชีพชั้นสูง',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/pws.png',
    levels:[['hvc1','ปวส. 1'],['hvc2','ปวส. 2']]
  },
  {
    id:'career',
    title:'เรียน วิชาชีพบุคคลทั่วไป',
    description:'ทักษะอาชีพและการเรียนรู้สำหรับบุคคลทั่วไป',
    backgroundFile:'Thailand workshop.JPG'
  },
  {
    id:'higher-education',
    title:'เรียน อุดมศึกษา',
    description:'การเรียนรู้และการทดสอบระดับอุดมศึกษา',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/univer.png'
  },
  {
    id:'university-prep',
    title:'เตรียมสอบเข้ามหาวิทยาลัย',
    description:'TGAT1–3 · TPAT1–5 · A-Level',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/hischool.png',
    titlePrefix:'เตรียมสอบ',
    cardTitle:'เข้ามหาวิทยาลัย'
  },
  {
    id:'dhamma-naktham',
    title:'นักธรรม (นักบวช)',
    titlePrefix:'เรียน',
    cardTitle:'นักธรรม (นักบวช)',
    description:'นักธรรมตรี · นักธรรมโท · นักธรรมเอก · แนวข้อสอบสนามหลวง พ.ศ. 2566'
  },
  {
    id:'dhamma-thammasuksa',
    title:'ธรรมศึกษา (บุคคลทั่วไป)',
    titlePrefix:'เรียน',
    cardTitle:'ธรรมศึกษา (บุคคลทั่วไป)',
    description:'ธรรมศึกษาตรี · โท · เอก แบ่งระดับประถม มัธยม และประชาชนทั่วไป'
  },
  {
    id:'military-prep',
    title:'เรียน เตรียมทหาร',
    description:'เลือกสายการสอบเตรียมทหาร',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/ppr.png',
    levels:[
      ['police','ตำรวจ'],
      ['army','ทหารบก (จปร.)'],
      ['airforce','ทหารอากาศ'],
      ['navy','ทหารเรือ']
    ]
  },
  {
    id:'nco',
    title:'เรียน ชั้นประทวนทหาร-ตำรวจ',
    description:'การฝึกฝนและเตรียมสอบชั้นประทวน',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/patuan.png'
  },
  {
    id:'recruitment',
    title:'เรียน เตรียมสอบบรรจุ',
    description:'เลือกกลุ่มการสอบบรรจุ',
    backgroundUrl:'https://media.nathoeng.com/uploads/school/bg/official.png',
    levels:[
      ['teacher','บรรจุครู'],
      ['government','บรรจุข้าราชการทั่วไป']
    ]
  }
];

const universityExams = [
  {code:'TGAT1', name:'การสื่อสารภาษาอังกฤษ', source:'https://www.mytcas.com/blueprint/tgat1-91/'},
  {code:'TGAT2', name:'การคิดอย่างมีเหตุผล', source:'https://www.mytcas.com/blueprint/tgat2-92/'},
  {code:'TGAT3', name:'สมรรถนะการทำงาน', source:'https://www.mytcas.com/blueprint/tgat3-93/'},
  {code:'TPAT1', name:'วิชาเฉพาะ กสพท (ความถนัดแพทย์)', source:'https://www9.si.mahidol.ac.th/'},
  {code:'TPAT2', name:'ความถนัดศิลปกรรมศาสตร์', source:'https://www.mytcas.com/blueprint/tpat2-20/'},
  {code:'TPAT3', name:'ความถนัดด้านวิทยาศาสตร์ เทคโนโลยี และวิศวกรรมศาสตร์', source:'https://www.mytcas.com/blueprint/tpat3-30/'},
  {code:'TPAT4', name:'ความถนัดทางสถาปัตยกรรม', source:'https://www.mytcas.com/blueprint/tpat4-40/'},
  {code:'TPAT5', name:'ความถนัดครุศาสตร์-ศึกษาศาสตร์', source:'https://www.mytcas.com/blueprint/tpat5-50/'}
];

let m1SoQuestions = [];

let data, subject = 'ENG', query = '', filter = 'all', noticeTimer, practice, currentArea = null;
let alevelData = null, alevelSubject = 'AL61', alevelQuery = '', alevelFilter = 'all';
let liveData = null, liveEditingId = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = member => [member.can_study?'นักเรียน':'',member.can_teach?'ครู / ผู้สอน':'',member.can_manage?'ผู้ดูแล':''].filter(Boolean).map(x=>`<span class="role">${x}</span>`).join('');
const QUESTION_IMAGE_REV = '20261006-crop3';
const freshQuestionImage = url => url ? `${url}${url.includes("?") ? "&" : "?"}v=${QUESTION_IMAGE_REV}` : '';

const commonsImage = file => file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` : '';
const militaryLevelImages = {
  police:'/images/military-prep/police.webp',
  army:'https://media.nathoeng.com/uploads/school/bg/ppr.png',
  navy:'https://media.nathoeng.com/uploads/school/bg/navy.png',
  airforce:'https://media.nathoeng.com/uploads/school/bg/airforce.png'
};

const learningCardArt = {
  vocational: `
    <svg viewBox="0 0 360 210" aria-hidden="true">
      <g class="art-person art-person-a">
        <circle cx="236" cy="59" r="24"/><path d="M217 53c5-20 39-22 46 1-8-7-15-9-24-8-8 0-15 3-22 7Z" class="hair"/>
        <path d="M205 109c5-24 18-35 34-35s30 11 35 35v54h-69Z" class="shirt"/>
        <path d="M205 109h69v28h-69Z" class="jacket"/><path d="M226 136h16v43h-16Z" class="pants"/><path d="M249 136h16v43h-16Z" class="pants"/>
        <path d="M209 112 183 139M270 112l24 25" class="limb"/>
        <path d="m177 140 16-17 6 5-16 17Z" class="tool"/>
      </g>
      <g class="art-person art-person-b">
        <circle cx="308" cy="78" r="20"/><path d="M291 72c5-17 30-18 35 0-10-6-24-6-35 0Z" class="hair"/>
        <path d="M282 119c4-20 15-29 28-29 14 0 25 9 29 29v44h-57Z" class="shirt"/>
        <path d="M287 136h47v8h-47Z" class="belt"/><rect x="292" y="115" width="36" height="26" rx="3" class="paper"/>
      </g>
      <path d="M174 176h174" class="ground"/>
    </svg>`,
  'higher-vocational': `
    <svg viewBox="0 0 360 210" aria-hidden="true">
      <g class="art-person">
        <circle cx="232" cy="61" r="23"/><path d="M214 55c3-18 34-23 43 0-12-7-30-7-43 0Z" class="hair"/>
        <path d="M202 111c5-24 18-35 32-35 16 0 29 11 35 35v57h-67Z" class="shirt"/>
        <path d="M223 137h17v41h-17Z" class="pants"/><path d="M247 137h17v41h-17Z" class="pants"/>
        <rect x="177" y="110" width="63" height="39" rx="5" class="laptop"/><path d="M171 151h76" class="laptop-line"/>
      </g>
      <g class="art-person art-person-b">
        <circle cx="308" cy="77" r="20"/><path d="M291 72c4-16 30-19 35 1-11-7-25-7-35-1Z" class="hair"/>
        <path d="M282 119c4-18 14-28 28-28s25 10 29 28v48h-57Z" class="shirt"/>
        <rect x="285" y="118" width="50" height="35" rx="3" class="blueprint"/><path d="m292 128 14 8 18-11M292 143h34" class="blueprint-line"/>
      </g>
      <path d="M171 178h178" class="ground"/>
    </svg>`,
  university: `
    <svg viewBox="0 0 360 210" aria-hidden="true">
      <g class="art-person">
        <circle cx="225" cy="62" r="23"/><path d="M207 57c4-20 35-23 42 0-11-7-29-7-42 0Z" class="hair"/>
        <path d="M195 111c5-24 18-35 32-35 15 0 28 11 34 35v57h-66Z" class="shirt"/>
        <path d="M217 137h17v41h-17Z" class="pants"/><path d="M241 137h17v41h-17Z" class="pants"/>
        <path d="M225 82v42" class="tie"/><rect x="176" y="108" width="50" height="41" rx="4" class="book"/><path d="M201 109v40" class="book-line"/>
      </g>
      <g class="art-person art-person-b">
        <circle cx="307" cy="74" r="21"/><path d="M289 70c3-19 34-22 38 1-12-7-26-8-38-1Z" class="hair"/>
        <path d="M279 118c4-21 15-31 29-31 15 0 26 10 30 31v50h-59Z" class="shirt"/>
        <path d="M290 136h39l-5 42h-29Z" class="skirt"/><rect x="280" y="115" width="45" height="31" rx="4" class="laptop"/>
      </g>
      <path d="M168 179h181" class="ground"/>
    </svg>`,
  military: `
    <svg viewBox="0 0 360 210" aria-hidden="true">
      <g class="art-person">
        <circle cx="235" cy="62" r="23"/><path d="M213 55h44l-5-13h-34Z" class="cap"/><path d="M205 112c5-25 18-36 32-36 16 0 29 11 35 36v58h-67Z" class="uniform"/>
        <path d="M221 83h32M214 105h47" class="uniform-line"/><circle cx="239" cy="118" r="3" class="button"/><circle cx="239" cy="130" r="3" class="button"/>
        <path d="M226 139h17v40h-17Z" class="uniform-dark"/><path d="M249 139h17v40h-17Z" class="uniform-dark"/>
      </g>
      <g class="art-person art-person-b">
        <circle cx="306" cy="77" r="20"/><path d="M287 72h38l-4-11h-29Z" class="cap"/><path d="M279 120c4-21 15-31 28-31 14 0 25 10 29 31v49h-57Z" class="uniform"/>
        <path d="M288 100h39" class="uniform-line"/><circle cx="308" cy="128" r="3" class="button"/>
      </g>
      <path d="M174 180h174" class="ground"/>
    </svg>`,
  recruitment: `
    <svg viewBox="0 0 360 210" aria-hidden="true">
      <g class="desk">
        <path d="M176 145h171v12H176Z"/><path d="M190 157h9v31h-9ZM326 157h9v31h-9Z"/>
      </g>
      <g class="art-person">
        <circle cx="225" cy="64" r="22"/><path d="M208 58c4-18 33-21 40 0-11-7-28-7-40 0Z" class="hair"/>
        <path d="M199 111c4-22 16-33 29-33 15 0 27 11 31 33v35h-60Z" class="shirt"/>
        <path d="M226 96v25" class="tie"/><path d="m242 122 26 16" class="limb"/>
        <rect x="257" y="128" width="45" height="28" rx="2" class="paper"/><path d="M263 136h31M263 143h24" class="paper-line"/>
      </g>
      <g class="art-person art-person-b">
        <circle cx="311" cy="78" r="19"/><path d="M295 72c4-16 28-19 33 0-10-6-23-6-33 0Z" class="hair"/>
        <path d="M286 120c4-19 14-28 27-28 13 0 23 9 27 28v28h-54Z" class="shirt"/>
        <path d="m300 124-20 14" class="limb"/>
      </g>
    </svg>`
};

async function api(url, options) {
  const response = await fetch(url, { credentials:'include', cache:'no-store', ...options });
  let result; try { result = await response.json(); } catch { throw new Error('อ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่'); }
  if (!response.ok || !result.success) { const error = new Error(result.message || 'ทำรายการไม่สำเร็จ'); error.status = response.status; throw error; }
  return result;
}

function notice(text) {
  const box = document.querySelector('#notice');
  box.textContent = text; box.classList.add('visible');
  clearTimeout(noticeTimer); noticeTimer = setTimeout(()=>box.classList.remove('visible'),4500);
}

function welcome(message = '') {
  practice?.destroy(); practice=null; currentArea=null;
  account.innerHTML = '';
  main.innerHTML = `<section class="welcome"><div class="hero hero-with-logo"><div class="hero-copy"><span class="eyebrow">NATHOENG SCHOOL</span><h1>เรียนรู้ไปด้วยกัน<br>เติบโตไปทีละเรื่อง</h1><p>พื้นที่เรียนรู้ของสมาชิกวัดพุทธอุทยานนาเทิง<br>รวมรายการหัวข้อเรียน และบันทึกการเรียนของตนเอง</p><a class="primary" href="https://watt.nathoeng.com/">เข้าสู่บัญชีสมาชิกวัด ↗</a></div><img class="hero-school-logo" src="https://media.nathoeng.com/uploads/school/logo/school-logo.png?v=20261006-media1" alt="ตรา Nathoeng School"></div>${message?`<p class="error" role="alert">${esc(message)}</p>`:''}<div class="steps"><strong>เข้า School ด้วยบัญชีสมาชิกเดิม</strong><br>1. ให้ผู้ดูแลวัดมอบสิทธิ์ School จากรายการสมาชิก<br>2. เปิด “บัญชีของฉัน” บนเว็บไซต์วัด<br>3. เลือก “การศึกษา School วัดนาเทิง”</div><p class="hint">เมื่อได้รับสิทธิ์แล้ว สามารถเข้า School จากเว็บไซต์วัดได้โดยไม่ต้องลงทะเบียนหรือล็อกอินอีกครั้ง</p></section>`;
}

function renderAccount() {
  account.innerHTML = `<span class="account-name">${esc(data.member.member_name)}</span><span>${roles(data.member)}</span>${data.member.can_manage?'<button type="button" id="open-explanation-admin">แก้ไขเฉลย</button>':''}<button type="button" id="logout">ออกจาก School</button>`;
  document.querySelector('#open-explanation-admin')?.addEventListener('click',()=>renderExplanationAdmin());
  document.querySelector('#logout').addEventListener('click',async()=>{
    try{
      await api('/api/session?route=logout',{method:'POST'});
      practice?.destroy(); practice=null; data=null; welcome();
    }catch(error){notice(error.message);}
  });
}


const explanationSubjectOptions = {
  army:[['ENG','อังกฤษ'],['MATH','คณิตศาสตร์'],['SCI','วิทยาศาสตร์'],['THAI','ภาษาไทย'],['SOC','สังคมศึกษา']],
  alevel:[['AL61','คณิต 1'],['AL64','ฟิสิกส์'],['AL65','เคมี'],['AL66','ชีววิทยา'],['AL82','อังกฤษ'],['AL81','ภาษาไทย'],['AL70','สังคม'],['TP30','TPAT3']],
  reference:[['AL61','คณิต 1'],['AL64','ฟิสิกส์'],['AL65','เคมี'],['AL66','ชีววิทยา'],['AL82','อังกฤษ'],['AL81','ภาษาไทย'],['AL70','สังคม']],
  dhamma:[['essay','เรียงความแก้กระทู้ธรรม'],['dhamma','วิชาธรรม'],['buddha','พุทธประวัติ'],['vinaya','วินัย / ศาสนพิธี']]
};
let explanationState = {bank:'army',subject:'',set:'',search:'',page:0,id:''};
const explanationEndpoint = params => '/api/school?route=explanation-editor&'+new URLSearchParams(params).toString();
const mediaExplanationURL = url => /^https:\/\/media\.nathoeng\.com\/uploads\/school\/[A-Za-z0-9/_.-]+\.(png|jpe?g|webp|gif)(\?v=[A-Za-z0-9_-]{1,40})?$/i.test(url);
function renderExplanationAdmin(bank,id) {
  if(!data?.member?.can_manage){notice('เฉพาะผู้ดูแล School');return;}
  practice?.destroy();practice=null;
  if(['army','alevel','reference','dhamma'].includes(bank) && bank!==explanationState.bank)
    explanationState={bank,subject:'',set:'',search:'',page:0,id:''};
  const s=explanationState;
  const options=(values,current)=>values.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===current?'selected':'')+'>'+esc(x[1])+'</option>').join('');
  const bankChoices=options([['army','เตรียมทหาร จปร.'],['alevel','A-Level / TPAT3 ชุดฝึกและสอบ'],['reference','คลังอ้างอิง A-Level'],['dhamma','นักธรรม / ธรรมศึกษา']],s.bank);
  const setChoices=options(Array.from({length:10},(_,i)=>[String(i+1),'ชุด '+(i+1)]),s.set);
  const subjectChoices=options(explanationSubjectOptions[s.bank],s.subject);
  main.innerHTML='<section class="page-head explanation-admin-header">'+
    '<button type="button" class="back-link" data-home>← กลับหน้า School</button><span class="eyebrow">ADMIN · ANSWER EXPLANATIONS</span>'+
    '<h1>แก้ไขเฉลยรายข้อ</h1><p>แก้ไขคำอธิบาย วิธีคิด และภาพประกอบเฉลย · ไม่เปลี่ยนโจทย์ ตัวเลือกเฉลย หรือคะแนน</p></section>'+
    '<section class="explanation-admin"><div class="explanation-list-area"><h2>ค้นหาข้อสอบ</h2>'+
    '<label>คลังข้อสอบ<select id="explanation-bank">'+bankChoices+'</select></label>'+
    '<div class="explanation-filters"><label>ชุด<select id="explanation-set" '+(s.bank==='reference'?'disabled':'')+'><option value="">ทุกชุด</option>'+setChoices+'</select></label>'+
    '<label>วิชา<select id="explanation-subject"><option value="">ทุกวิชา</option>'+subjectChoices+'</select></label></div>'+
    '<form id="explanation-search-form" class="explanation-search"><input name="search" maxlength="60" placeholder="รหัสข้อหรือคำในโจทย์" value="'+esc(s.search)+'" aria-label="ค้นหาข้อสอบ"><button type="submit" class="secondary">ค้นหา</button></form>'+
    '<div id="explanation-list" role="status">กำลังเปิดคลังข้อสอบ…</div>'+
    '<div class="explanation-pagination"><button type="button" class="secondary" data-explanation-page="-1">← ก่อนหน้า</button><span id="explanation-page-label"></span><button type="button" class="secondary" data-explanation-page="1">ถัดไป →</button></div></div>'+
    '<div class="explanation-edit-area" id="explanation-edit-area"><h2>เทมเพลตแก้ไขเฉลย</h2><p class="explanation-empty">เลือกข้อสอบทางซ้ายเพื่อแก้ไข</p></div></section>';
  loadExplanationList();
  if(id)openExplanationQuestion(id);
}
async function loadExplanationList(){
  const s=explanationState,bank=s.bank,page=s.page,box=main.querySelector('#explanation-list');
  if(!box)return;
  box.textContent='กำลังค้นหา…';
  try{
    const result=await api(explanationEndpoint({bank,page,subject_id:s.subject,set_no:s.set,search:s.search}));
    if(!box.isConnected||bank!==explanationState.bank||page!==explanationState.page)return;
    box.innerHTML=result.items.length?result.items.map(q=>
      '<button type="button" class="explanation-question-item '+(q.question_id===explanationState.id?'selected':'')+'" data-explanation-question="'+esc(q.question_id)+'">'+
      '<strong>'+esc(q.question_id)+' · '+esc(q.subject_id)+(q.set_no?' · ชุด '+esc(q.set_no):'')+'</strong>'+
      '<span>'+esc(String(q.prompt||'').slice(0,145))+'</span>'+
      (q.explanation_updated_at?'<small>แก้ไขเฉลยแล้ว</small>':'')+'</button>').join(''):'<p class="explanation-empty">ไม่พบข้อสอบ</p>';
    main.querySelector('#explanation-page-label').textContent='หน้า '+(page+1);
    main.querySelector('[data-explanation-page="-1"]').disabled=page===0;
    main.querySelector('[data-explanation-page="1"]').disabled=!result.has_more;
  }catch(err){if(box.isConnected)box.innerHTML='<p class="practice-inline-error">'+esc(err.message)+'</p>';}
}
async function openExplanationQuestion(id){
  const box=main.querySelector('#explanation-edit-area'),bank=explanationState.bank;
  if(!box)return;
  explanationState.id=id;box.textContent='กำลังโหลดโจทย์…';
  try{
    const result=await api(explanationEndpoint({bank,question_id:id}));
    if(!box.isConnected||bank!==explanationState.bank||id!==explanationState.id)return;
    const q=result.question,key=bank==='dhamma'?(q.answer_text||q.answer_key):q.answer_key_json&&Number(q.set_no)===2?q.answer_key_json:q.answer_key;
    const keyText=key==null?'—':typeof key==='object'?JSON.stringify(key):String(key);
    box.innerHTML='<h2>แก้ไขเฉลย <small>'+esc(q.question_id)+'</small></h2>'+
      '<div class="explanation-question-preview"><strong>ข้อ '+esc(q.question_no??'—')+' · '+esc(q.subject_id)+'</strong>'+
      '<p>'+esc(q.prompt)+'</p>'+(q.question_image_url?'<img src="'+esc(q.question_image_url)+'" alt="ภาพโจทย์เดิม">':'')+
      '<p><strong>คำตอบที่ถูกต้อง (อ่านอย่างเดียว):</strong> '+esc(keyText)+'</p></div>'+
      '<form id="explanation-edit-form"><input type="hidden" name="question_id" value="'+esc(q.question_id)+'">'+
      '<label>คำอธิบาย / แปลโจทย์ / สาระความรู้<textarea name="explanation" rows="6" maxlength="12000" placeholder="คำอธิบายของข้อนี้…">'+esc(q.explanation||'')+'</textarea></label>'+
      '<label>เหตุผล / วิธีทำทีละขั้น / จุดที่ควรระวัง<textarea name="reasoning" rows="7" maxlength="12000" placeholder="ขั้นที่ 1 …">'+esc(q.reasoning||'')+'</textarea></label>'+
      '<label>URL ภาพประกอบเฉลยจาก Media<input type="url" name="explanation_image_url" maxlength="500" placeholder="https://media.nathoeng.com/uploads/school/..." value="'+esc(q.explanation_image_url||'')+'"></label>'+
      '<small>เว้น URL ว่างได้ · รูปเฉลยแยกจากรูปโจทย์เดิม</small>'+
      '<div class="explanation-action-row"><button type="submit" class="practice-primary">บันทึกเฉลยข้อนี้</button><span id="explanation-save-status" role="status"></span></div></form>'+
      '<div class="explanation-live-preview"><h3>ตัวอย่างเมื่อเปิดเฉลยให้นักเรียน</h3><div id="explanation-preview"></div></div>'+
      (q.explanation_updated_at?'<p class="explanation-edit-meta">แก้ไขล่าสุด '+esc(new Date(q.explanation_updated_at).toLocaleString('th-TH'))+' โดย '+esc(q.explanation_updated_by||'ผู้ดูแล')+'</p>':'');
    renderExplanationPreview();loadExplanationList();
  }catch(err){if(box.isConnected)box.innerHTML='<p class="practice-inline-error">'+esc(err.message)+'</p>';}
}
function renderExplanationPreview(){
  const form=main.querySelector('#explanation-edit-form'),box=main.querySelector('#explanation-preview');
  if(!form||!box)return;
  const exp=form.elements.explanation.value,reason=form.elements.reasoning.value,url=form.elements.explanation_image_url.value.trim();
  box.innerHTML='<h4>คำอธิบาย</h4><p>'+esc(exp||'—')+'</p><h4>เหตุผล / วิธีคิด</h4><p>'+esc(reason||'—')+'</p>'+
    (mediaExplanationURL(url)?'<figure class="practice-source-figure"><img src="'+esc(url)+'" alt="ภาพประกอบเฉลย" loading="lazy"><figcaption>ภาพประกอบคำอธิบาย</figcaption></figure>':
      url?'<p class="practice-inline-error">URL ต้องมาจาก Media ของ School</p>':'');
}

function areaCard(area) {
  const ready = area.id === 'military-prep'
    ? '<span class="learning-ready">มีคลังข้อสอบแล้ว: ทหารบก (จปร.)</span>'
     : area.id === 'secondary'
      ? '<span class="learning-ready">พร้อมเรียน: ภาษาอังกฤษ ม.1 · A-Level 2568</span>'
      : area.id === 'university-prep'
      ? '<span class="learning-ready">มีคลังข้อสอบแล้ว: A-Level 2568</span>'
      : area.id === 'dhamma-naktham'
      ? '<span class="learning-ready">เริ่มฝึกได้: นักธรรมตรี วิชาธรรม พ.ศ. 2566 (10 ข้อ)</span>'
      : area.id === 'dhamma-thammasuksa'
      ? '<span class="learning-muted">เปิดหมวดเรียนแล้ว · รอนำเข้าข้อสอบ</span>'
      : '<span class="learning-muted">อยู่ระหว่างการดำเนินงาน</span>';
  const bg = area.backgroundUrl || commonsImage(area.backgroundFile);
  const art = area.art ? learningCardArt[area.art] : '';
  const bgStyle = bg ? ` style="--card-bg:url('${esc(bg)}')"` : '';
  const mainTitle = area.cardTitle || String(area.title || '').replace(/^เรียน\s+/, '');
  return `<button type="button" class="learning-card ${bg?'has-bg':''} ${art?'has-art art-'+esc(area.art):''} ${area.id.startsWith('dhamma-')?'dhamma-track-card':''}" data-area="${esc(area.id)}"${bgStyle}>${art?`<span class="learning-card-art">${art}</span>`:''}<span class="learning-card-kicker">หมวดการเรียน</span><strong class="learning-title"><span class="learning-title-prefix">${esc(area.titlePrefix || 'เรียน')}</span><span class="learning-title-main">${esc(mainTitle)}</span></strong><small>${esc(area.description)}</small>${ready}<span class="learning-arrow" aria-hidden="true">→</span></button>`;
}

function renderLearningHome() {
  practice?.destroy(); practice=null; currentArea=null;
  main.innerHTML = `<section class="hero learning-home-hero hero-with-logo"><div class="hero-copy"><span class="eyebrow">NATHOENG SCHOOL</span><h1>เลือกประเภทการเรียน ฝึกฝน และทดสอบ</h1><p>เริ่มจากระดับหรือเส้นทางที่ต้องการ ระบบจะแยกเนื้อหาและแบบฝึกให้เป็นหมวดชัดเจน เพื่อให้ค้นหาและติดตามผลการเรียนได้ง่าย</p></div><img class="hero-school-logo" src="https://media.nathoeng.com/uploads/school/logo/school-logo.png?v=20261006-media1" alt="ตรา Nathoeng School"></section>
  <section class="live-home-banner"><div><span class="eyebrow">เรียนสดกับครู</span><h2>ห้องเรียนออนไลน์ผ่าน Zoom</h2><p>ดูตารางสอน เข้าห้องเรียน และทำโจทย์กับครูผ่าน NATHOENG SCHOOL</p></div><button type="button" class="live-open-button" data-live-open>เปิดห้องเรียนสด →</button></section>
  <section>
    <div class="section-title"><div><h2>ประเภทการเรียน</h2><p>เลือกหมวดที่ต้องการ แล้วจึงเลือกระดับหรือสายการสอบในขั้นถัดไป</p></div>${data.member.can_manage?'<button type="button" class="secondary" id="members">สมาชิก School</button>':''}</div>
    <div class="learning-grid">${learningAreas.map(areaCard).join('')}</div>
  </section>`;
  document.querySelector('#members')?.addEventListener('click',showMembers);
}

function renderArea(areaId) {
  const area = learningAreas.find(item=>item.id===areaId);
  if (!area) return renderLearningHome();
  currentArea = area;
  practice?.destroy(); practice=null;
  if (area.id === 'university-prep') return renderUniversityPrep();
  if (area.id === 'dhamma-naktham' || area.id === 'dhamma-thammasuksa'){
    return renderDhamma({main,track:area.id==='dhamma-naktham'?'naktham':'thammasuksa',member:data.member,api,notice,
      onHome:renderLearningHome,onEdit:id=>renderExplanationAdmin('dhamma',id)});
  }
  if (!area.levels) return renderUnavailable(area.title, null);
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-home>← กลับประเภทการเรียน</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>${esc(area.title)}</h1><p>${esc(area.description)} — เลือกระดับหรือสายการเรียนที่ต้องการ</p></section>
  <section class="level-grid ${area.id==='military-prep'?'military-level-grid':''}">${area.levels.map(([id,label])=>{
    const hasContent = (area.id === 'military-prep' && id === 'army') || (area.id === 'secondary' && id === 'm1');
    const hasSubmenu = area.id === 'secondary' && id === 'm6';
    const status = hasContent ? '<small class="level-status ready">พร้อมใช้งาน</small>' : hasSubmenu ? '<small class="level-status ready">มี A-Level 2568 พร้อมใช้งาน</small>' : '<small class="level-status pending">อยู่ระหว่างการดำเนินงาน</small>';
    const militaryImage = area.id === 'military-prep' ? militaryLevelImages[id] : '';
    const imageStyle = militaryImage ? ` style="--level-bg:url('${esc(militaryImage)}')"` : '';
    return `<button type="button" class="level-card ${militaryImage?'has-level-photo':''}" data-level="${esc(id)}"${imageStyle}><span><strong>${esc(label)}</strong>${status}</span><b aria-hidden="true">→</b></button>`;
  }).join('')}</section>`;
}

function renderUnavailable(areaTitle, levelLabel) {
  practice?.destroy(); practice=null;
  const title = levelLabel || areaTitle;
  const path = levelLabel ? `${areaTitle} / ${levelLabel}` : areaTitle;
  const back = levelLabel ? 'data-back-area' : 'data-home';
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" ${back}>← กลับ</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>${esc(title)}</h1><p>${esc(path)}</p></section>
  <section class="empty-state"><strong>อยู่ระหว่างการดำเนินงาน</strong><p>ขณะนี้ยังไม่มีเนื้อหาหรือชุดทดสอบในหมวดนี้</p><button type="button" class="secondary" data-home>กลับหน้าประเภทการเรียน</button></section>`;
}

function openLevel(levelId) {
  if (!currentArea) return renderLearningHome();
  const level = currentArea.levels?.find(([id])=>id===levelId);
  if (!level) return;
  const [, label] = level;
  if (currentArea.id === 'military-prep' && levelId === 'army') {
    renderCatalogShell(currentArea.title, label);
    return;
  }
  if (currentArea.id === 'secondary' && levelId === 'm1') {
    renderM1(); return;
  }
  if (currentArea.id === 'secondary' && levelId === 'm6') {
    renderM6();
    return;
  }
  renderUnavailable(currentArea.title, label);
}

function renderM1() {
  practice?.destroy(); practice=null;
  const teacher=Boolean(data.member.can_teach || data.member.can_manage);
  main.innerHTML = '<section class="page-head"><button type="button" class="back-link" data-back-area>← กลับชั้นมัธยม</button><span class="eyebrow">NATHOENG SCHOOL · M.1</span><h1>มัธยมศึกษาปีที่ 1</h1><p>เลือกบทเรียนและแบบฝึกหัด</p></section>'
    + '<section class="level-grid"><button type="button" class="level-card" data-m1-so-open><span><strong>ภาษาอังกฤษ — Using “So” in Conversations</strong><small class="level-status ready">15 ข้อ · เติมคำในบทสนทนา · บันทึกคะแนนเข้าระบบ</small></span><b aria-hidden="true">→</b></button>'
    + (teacher?'<button type="button" class="level-card" data-m1-so-reports><span><strong>ผลการทำแบบฝึกภาษาอังกฤษ ม.1</strong><small class="level-status ready">สำหรับครูและผู้ดูแล · คะแนนและข้อที่ยังตอบผิด</small></span><b aria-hidden="true">→</b></button>':'')
    + '</section><p class="progress-note" style="margin-top:18px">รายวิชาอื่นของ ม.1 อยู่ระหว่างดำเนินงาน</p>';
}
async function renderM1SoPractice() {
  practice?.destroy(); practice=null;
  main.innerHTML='<section class="empty-state" data-so-m1-loading>กำลังเปิดแบบฝึก ม.1…</section>';
  try {
    const [paper,history]=await Promise.all([
      api('/api/school?route=m1-so-paper'),
      api('/api/school?route=m1-so-history')
    ]);
    if (!main.querySelector('[data-so-m1-loading]')) return;
    m1SoQuestions=paper.questions || [];
    if(m1SoQuestions.length!==15)throw new Error('แบบฝึกยังมีข้อไม่ครบ');
    const past=(history.attempts||[]).slice(0,5);
    main.innerHTML = '<section class="page-head"><button type="button" class="back-link" data-back-m1>← กลับบทเรียน ม.1</button><span class="eyebrow">ENGLISH · M.1 · CONVERSATIONS</span><h1>Using “So” in Conversations</h1><p>เติมคำในบทสนทนา แล้วกดส่งตรวจ ระบบจะบันทึกคะแนนของสมาชิกปัจจุบันโดยอัตโนมัติ</p></section>'
      + '<section class="chapter" style="padding:20px 24px;line-height:1.8"><strong>Grammar Tips / สรุปการใช้ So</strong><p>I like cats. — <b>So do I.</b> (ฉันก็ชอบ) · I am happy. — <b>So am I.</b> (ฉันก็มีความสุข)</p><p>I can swim. — <b>So can I.</b> · There is a cat. — <b>So there is!</b> (จริงด้วย) · I was tired, <b>so</b> I slept. (ดังนั้น)</p></section>'
      + '<section class="chapter" aria-label="แบบฝึกภาษาอังกฤษ ม.1">' + m1SoQuestions.map((q,i)=>'<div class="topic" style="grid-template-columns:1fr"><div style="min-width:0"><strong>Question '+esc(q.question_no)+'</strong><p>A: '+esc(q.speaker_a)+'</p><p>B: '+esc(q.speaker_b)+'</p><label for="so-m1-'+i+'" style="font-size:12px;color:#66766c;display:block;margin-bottom:6px">Fill in one word</label><input id="so-m1-'+i+'" data-so-m1-input="'+i+'" type="text" maxlength="20" autocomplete="off" spellcheck="false" style="padding:11px 12px;max-width:260px;width:100%;border:1px solid #cbd9ce;border-radius:10px" placeholder="Your answer"><p data-so-m1-feedback="'+i+'" role="status" style="display:none;font-size:13px;line-height:1.7"></p></div></div>').join('') + '</section>'
      + '<section class="chapter" style="padding:24px"><strong id="so-m1-score" role="status" style="display:block;font-size:19px;margin-bottom:16px">15 questions · ยังไม่ได้ส่งตรวจ</strong>'
      + (data.member.can_study?'<button type="button" class="secondary" data-so-m1-check style="background:#193e35;color:white;margin-right:8px">ส่งตรวจและบันทึกคะแนน</button><button type="button" class="secondary" data-so-m1-retry>ทำอีกครั้ง / Retry</button>':'<p class="progress-note">บัญชีครูที่ไม่มีสิทธิ์นักเรียนสามารถดูแบบฝึกได้ แต่ส่งคะแนนแทนนักเรียนไม่ได้</p>')
      + '<p class="progress-note" style="margin:16px 0 0">คะแนนนี้เป็นคะแนนฝึกทบทวน ไม่ใช่คะแนนสอบจริง การทำใหม่แต่ละครั้งจะเก็บเป็นประวัติอีกหนึ่งรายการ</p></section>'
      + '<section class="chapter" style="padding:20px 24px"><strong>ประวัติคะแนนล่าสุดของฉัน</strong><div data-so-m1-history style="margin-top:12px">'
      + (past.length?past.map(a=>'<p style="margin:7px 0;font-size:13px">'+esc(new Date(a.submitted_at).toLocaleString('th-TH'))+' — <b>'+esc(a.correct_count)+'/'+esc(a.total_count)+'</b></p>').join(''):'<p style="font-size:13px;color:#738078">ยังไม่เคยส่งแบบฝึกนี้</p>')
      + '</div></section>';
  }catch(error){
    if(main.querySelector('[data-so-m1-loading]')){
      main.innerHTML='<section class="page-head"><button type="button" class="back-link" data-back-m1>← กลับบทเรียน ม.1</button><h1>Using “So” in Conversations</h1></section><section class="empty-state"><strong>เปิดแบบฝึกไม่สำเร็จ</strong><p>'+esc(error.message)+'</p></section>';
    }
  }
}
async function checkM1SoPractice() {
  const button=main.querySelector('[data-so-m1-check]');
  if (!button || button.disabled || m1SoQuestions.length!==15)return;
  const payload=m1SoQuestions.map((q,i)=>({question_no:q.question_no,answer:main.querySelector('[data-so-m1-input="'+i+'"]')?.value?.trim()||''}));
  button.disabled=true;button.textContent='กำลังตรวจและบันทึกคะแนน…';
  try {
    const response=await api('/api/school?route=m1-so-submit',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({answers:payload})
    });
    const item=response.item;
    if(!item || !Array.isArray(item.feedback) || item.feedback.length!==15)throw new Error('ระบบตรวจยังไม่ตอบกลับครบ 15 ข้อ');
    const feedbackByNumber=new Map(item.feedback.map(q=>[q.question_no,q]));
    m1SoQuestions.forEach((q,i)=>{
      const field=main.querySelector('[data-so-m1-input="'+i+'"]');
      const feedback=main.querySelector('[data-so-m1-feedback="'+i+'"]');
      const graded=feedbackByNumber.get(q.question_no);
      if(!field || !feedback || !graded)return;
      field.disabled=true;
      feedback.style.display='block';feedback.style.color=graded.is_correct?'#246346':'#9b372c';
      feedback.textContent=(graded.is_correct?'✓ Correct!':'✗ Answer: '+graded.answer)+' — '+graded.explanation;
    });
    const label=main.querySelector('#so-m1-score');
    if(label)label.textContent='Your Score: '+item.correct_count+' / '+item.total_count+' ('+Math.round(100*item.correct_count/item.total_count)+'%) · บันทึกแล้ว';
    const history=main.querySelector('[data-so-m1-history]');
    if(history)history.insertAdjacentHTML('afterbegin','<p style="margin:7px 0;font-size:13px"><b>ล่าสุด: '+esc(new Date(item.submitted_at).toLocaleString('th-TH'))+' — '+esc(item.correct_count)+'/'+esc(item.total_count)+'</b></p>');
    button.textContent='ส่งตรวจแล้ว ✓';
    notice('ตรวจคำตอบและบันทึกคะแนนเรียบร้อย');
  }catch(error){
    button.disabled=false;button.textContent='ส่งตรวจและบันทึกคะแนน';
    notice('ยังไม่ได้บันทึกคะแนน: '+error.message);
  }
}
async function renderM1SoReports() {
  if(!data.member.can_teach && !data.member.can_manage)return notice('เฉพาะครูหรือผู้ดูแล');
  main.innerHTML='<section class="empty-state" data-so-m1-report-loading>กำลังโหลดผลแบบฝึกภาษาอังกฤษ ม.1…</section>';
  try {
    const result=await api('/api/school?route=m1-so-results');
    if(!main.querySelector('[data-so-m1-report-loading]'))return;
    const students=result.students||[];
    const completed=students.filter(s=>s.latest).length;
    const rows=students.map(s=>{
      const last=s.latest;
      const wrong=last?.wrong_answers||[];
      return '<article class="topic" style="grid-template-columns:1fr"><div><strong>'+esc(s.member_name)+'</strong>'
        + '<p style="margin:7px 0 0;color:#738078;font-size:12px">'+(s.is_active?'บัญชีใช้งาน':'บัญชีไม่ใช้งาน')+' · ทำแล้ว '+esc(s.attempt_count)+' ครั้ง</p>'
        + (last?'<p style="margin:9px 0"><b>คะแนนล่าสุด '+esc(last.correct_count)+'/'+esc(last.total_count)+'</b> · '+esc(Math.round(100*last.correct_count/last.total_count))+'% · '+esc(new Date(last.submitted_at).toLocaleString('th-TH'))+'</p>'
          + (wrong.length?'<details><summary>ดูข้อที่ตอบผิด ('+wrong.length+' ข้อ)</summary><ol>'+wrong.map(q=>'<li style="margin:12px 0">ข้อ '+esc(q.question_no)+' · ตอบ: <b>'+esc(q.selected_answer||'(เว้นว่าง)')+'</b> · เฉลย: <b>'+esc(q.answer)+'</b><div style="color:#738078;font-size:12px">'+esc(q.explanation)+'</div></li>').join('')+'</ol></details>':'<p style="color:#246346;font-size:12px">✓ ตอบถูกทุกข้อ</p>')
          :'<p style="margin:9px 0;color:#738078;font-size:13px">ยังไม่ส่งแบบฝึก</p>')
      + '</div></article>';
    }).join('');
    main.innerHTML='<section class="page-head"><button type="button" class="back-link" data-back-m1>← กลับบทเรียน ม.1</button><span class="eyebrow">NATHOENG SCHOOL · TEACHER</span><h1>ผลการฝึก English M.1 — So</h1><p>คะแนนล่าสุดและข้อที่ตอบผิดของนักเรียน (รายงานนี้ไม่ใช่คะแนนสอบจริง)</p></section>'
      + '<section class="stats"><div class="stat"><strong>'+esc(students.length)+'</strong><span>นักเรียน</span></div><div class="stat"><strong>'+esc(completed)+'</strong><span>ส่งแล้ว</span></div></section>'
      + '<section class="chapter"><div style="padding:20px 23px"><strong>ติดตามผลรายคน</strong>'+(result.truncated?'<p class="progress-note">แสดงเฉพาะประวัติ 1,000 รายการล่าสุด อาจมีจำนวนครั้งที่ไม่ครบ</p>':'')+'</div>'+ (rows||'<div class="topic">ยังไม่มีนักเรียน</div>') +'</section>';
  }catch(error){
    if(main.querySelector('[data-so-m1-report-loading]'))
      main.innerHTML='<section class="page-head"><button type="button" class="back-link" data-back-m1>← กลับบทเรียน ม.1</button><h1>ผลแบบฝึก</h1></section><section class="empty-state"><strong>โหลดรายงานไม่สำเร็จ</strong><p>'+esc(error.message)+'</p></section>';
  }
}

function renderM6() {
  practice?.destroy(); practice=null;
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-back-area>← กลับชั้นมัธยม</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>มัธยมศึกษาปีที่ 6</h1><p>เลือกการเรียนตามระดับชั้น หรือเตรียมสอบเข้ามหาวิทยาลัย</p></section>
  <section class="level-grid">
    <button type="button" class="level-card" data-m6-path="curriculum"><span><strong>เรียนตามระดับชั้น ม.6</strong><small class="level-status pending">อยู่ระหว่างการดำเนินงาน</small></span><b aria-hidden="true">→</b></button>
    <button type="button" class="level-card" data-m6-path="university"><span><strong>เตรียมสอบเข้ามหาวิทยาลัย</strong><small class="level-status">A-Level · TGAT · TPAT</small></span><b aria-hidden="true">→</b></button>
  </section>`;
}

function renderUniversityPrep() {
  practice?.destroy(); practice=null;
  const fromM6 = currentArea?.id === 'secondary';
  main.innerHTML = `<section class="page-head university-prep-hero"><button type="button" class="back-link" ${fromM6?'data-m6':'data-home'}>← ${fromM6?'กลับ ม.6':'กลับประเภทการเรียน'}</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>เตรียมสอบเข้ามหาวิทยาลัย</h1><p>เลือกหัวข้อ TGAT1–3, TPAT1–5 หรือข้อสอบ A-Level</p></section>
  ${[['TGAT','ความถนัดทั่วไป'],['TPAT','ความถนัดทางวิชาการและวิชาชีพ']].map(([group,label])=>`<section class="university-exam-section" aria-labelledby="exam-heading-${group}"><div class="section-title"><div><h2 id="exam-heading-${group}">${group}</h2><p>${label}</p></div></div><div class="level-grid">${universityExams.filter(exam=>exam.code.startsWith(group)).map(exam=>`<button type="button" class="level-card university-exam-card" data-university-exam="${esc(exam.code)}"><span><strong>${esc(exam.code)}</strong><span class="university-exam-name">${esc(exam.name)}</span><small class="level-status ${exam.code==='TPAT3'?'':'pending'}">${exam.code==='TPAT3'?'ชุด 1 · 70 ข้อ · 180 นาที':'อยู่ระหว่างการดำเนินการ'}</small></span><b aria-hidden="true">→</b></button>`).join('')}</div></section>`).join('')}
  <section class="university-exam-section" aria-labelledby="exam-heading-alevel"><div class="section-title"><div><h2 id="exam-heading-alevel">A-Level</h2><p>ความรู้รายวิชา · เปิดคลังข้อสอบและติดตามการเรียน</p></div></div><div class="level-grid">
    <button type="button" class="level-card" data-university-exam="alevel"><span><strong>A-Level</strong><small class="level-status ready">พร้อมใช้งาน · ปี 2568 · 315 ข้อ</small></span><b aria-hidden="true">→</b></button>
  </div></section>`;
}

async function renderUniversityExam(code) {
  const exam = universityExams.find(item=>item.code===code);
  if (!exam) return renderUniversityPrep();
  practice?.destroy(); practice=null;
  if (code==='TPAT3') {
    main.innerHTML='<section class="empty-state"><strong>กำลังเปิด TPAT3 ชุด 1…</strong></section>';
    try {
      alevelData=await api('/api/alevel?route=catalog');
      if (!alevelData.subjects?.some(s=>s.subject_id==='TP30')) {
        main.innerHTML=`<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">TPAT3</span><h1>TPAT3 · ชุด 1</h1><p>ข้อสอบแต่งใหม่ตาม Blueprint · 70 ข้อ · 5 ตัวเลือก · 180 นาที</p></section><section class="empty-state"><strong>รอนำเข้าชุดข้อสอบ</strong><p>${data.member.can_manage?'ผู้ดูแลนำเข้าไฟล์ School_TPAT3_Set1_Install.sql ในฐานข้อมูล School แล้วกลับมาเปิดหน้านี้เพื่อติดตั้งรูป':'กำลังเตรียมโจทย์และรูปประกอบสำหรับชุด 1'}</p></section>`;
        return;
      }
      alevelData.tpat3_installation=await api('/api/alevel?route=tpat3-status');
      return renderALevelCatalog('TP30');
    } catch(error) {
      main.innerHTML=`<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><h1>TPAT3 · ชุด 1</h1></section><section class="empty-state"><strong>เปิดชุดข้อสอบไม่สำเร็จ</strong><p>${esc(error.message)}</p></section>`;
      return;
    }
  }
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">เตรียมสอบเข้ามหาวิทยาลัย</span><h1>${esc(exam.code)}</h1><p>${esc(exam.name)}</p></section>
  <section class="empty-state"><strong>อยู่ระหว่างการดำเนินการ</strong><p>หัวข้อ ${esc(exam.code)} เตรียมไว้แล้ว ขณะนี้ยังไม่มีบทเรียนหรือชุดข้อสอบในหัวข้อนี้</p><a class="secondary" href="${esc(exam.source)}" target="_blank" rel="noopener noreferrer">${exam.code==='TPAT1'?'ดูข้อมูลวิชาเฉพาะจาก กสพท':'ดูโครงสร้างข้อสอบจาก MyTCAS'} ↗</a></section>`;
}

async function renderALevelSubjects() {
  practice?.destroy(); practice=null;
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL</span><h1>ข้อสอบ A-Level</h1><p>ใช้หลักการเดียวกับคลังข้อสอบ จปร. — แยกวิชา หมวด หัวข้อ ข้อสอบต้นฉบับ และบันทึกความก้าวหน้ารายคน</p></section>
  <section class="empty-state"><strong>กำลังเปิดคลัง A-Level 2568…</strong><p>กำลังอ่านโครงสร้างรายวิชาและหัวข้อจากฐานข้อมูล School</p></section>`;
  try {
    let result = await api('/api/alevel?route=catalog');
    if (result.setup_required) {
      alevelData = null;
      main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL</span><h1>ข้อสอบ A-Level</h1><p>โครงสร้างระบบพร้อมแล้ว เหลือเปิดตาราง A-Level ใน Supabase</p></section>
      <section class="empty-state"><strong>ต้องรัน School_ALevel_schema.sql หนึ่งครั้ง</strong><p>หลังรัน SQL แล้ว หน้านี้จะแสดง 7 วิชา พร้อมหมวด หัวข้อ และคลังข้อสอบปี 2568 โดยไม่กระทบระบบ จปร. เดิม</p></section>`;
      return;
    }
    alevelData = result;
    result={...result,sources:result.sources.filter(s=>s.subject_id!=='TP30'),source_question_count:result.sources.filter(s=>s.subject_id!=='TP30').reduce((n,s)=>n+Number(s.question_count||0),0),subjects:result.subjects.filter(s=>s.subject_id!=='TP30'),chapters:result.chapters.filter(s=>s.subject_id!=='TP30'),topics:result.topics.filter(s=>s.subject_id!=='TP30'),question_count:result.subjects.filter(s=>s.subject_id!=='TP30').reduce((n,s)=>n+s.imported_question_count,0)};
    const sourceTotal = result.source_question_count || 0;
    main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL · 2568</span><h1>ข้อสอบ A-Level</h1><p>เลือกวิชาเพื่อเปิดหมวดและหัวข้อ เนื้อหาต้นฉบับรวม ${sourceTotal.toLocaleString('th-TH')} ข้อจาก 7 รายวิชา</p></section>
    <section class="stats" aria-label="ภาพรวม A-Level"><div class="stat"><strong>${result.subjects.length}</strong><span>วิชา</span></div><div class="stat"><strong>${result.chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${result.topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${result.question_count}</strong><span>ข้อที่นำเข้ารายข้อแล้ว</span></div></section>
    <section class="level-grid">${result.subjects.map(s=>{
      const imported = Number(s.imported_question_count || 0);
      const total = Number(s.source_question_count_2568 || 0);
      const status = imported ? `<small class="level-status ready">นำเข้าแล้ว ${imported}/${total} ข้อ</small>` : `<small class="level-status">ต้นฉบับ ${total} ข้อ · พร้อมจัดเข้าหัวข้อ</small>`;
      return `<article class="level-card alevel-quick-card">
        <button type="button" class="alevel-subject-link" data-alevel-subject="${esc(s.subject_id)}"><span><strong>${esc(s.subject_name_th)}</strong>${status}</span><b aria-hidden="true">→</b></button>
        <button type="button" class="alevel-test-button" data-alevel-test="${esc(s.subject_id)}" aria-label="ทดสอบเสมือนจริงวิชา ${esc(s.subject_name_th)}" ${!data.member.can_study?'disabled title="สำหรับนักเรียนเท่านั้น"':''}>⏱ ทดสอบ <small>${esc(String(s.duration_minutes))} นาที</small></button>
      </article>`;
    }).join('')}</section>`;
  } catch (error) {
    main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL</span><h1>ข้อสอบ A-Level</h1></section><section class="empty-state"><strong>เปิดคลัง A-Level ไม่สำเร็จ</strong><p>${esc(error.message)}</p></section>`;
  }
}

async function renderALevelCatalog(subjectId) {
  practice?.destroy(); practice=null;
  if (!alevelData) {
    await renderALevelSubjects();
    if (!alevelData) return;
  }
  const s = alevelData.subjects.find(x=>x.subject_id===subjectId);
  if (!s) return renderALevelSubjects();
  alevelSubject = subjectId;
  const isTPAT3=subjectId==='TP30';
  const installation=isTPAT3?alevelData.tpat3_installation:null;
  const trackName=isTPAT3?'TPAT3':'A-Level';
  alevelQuery = '';
  alevelFilter = 'all';
  const source = alevelData.sources.find(x=>x.subject_id===subjectId);
  const chapters = alevelData.chapters.filter(x=>x.subject_id===subjectId);
  const topics = alevelData.topics.filter(x=>x.subject_id===subjectId);
  const progress = new Map((alevelData.viewedProgress || alevelData.progress).map(p=>[p.topic_id,p.status]));
  const completed = topics.filter(t=>progress.get(t.topic_id)==='completed').length;
  main.innerHTML = `<section id="practice-dashboard" class="practice-dashboard" aria-label="ผลการฝึก A-Level ของฉัน"></section>
  <section class="hero"><button type="button" class="hero-back" ${isTPAT3?'data-university-prep':'data-university-exam="alevel"'}>← ${isTPAT3?'เตรียมสอบเข้ามหาวิทยาลัย':'A-Level'}</button><span class="eyebrow">${isTPAT3?'TPAT3':'A-LEVEL'} · ${esc(String(s.subject_code))}</span><h1>${esc(s.subject_name_th)}</h1><p>${isTPAT3?'ชุด 1 · ข้อสอบแต่งใหม่ตาม Blueprint':'ข้อสอบจริง พ.ศ. 2568'} · ${esc(String(source?.question_count || s.source_question_count_2568))} ข้อ · ${esc(String(s.duration_minutes))} นาที<br>${isTPAT3?'5 หมวด · 15 / 15 / 15 / 15 / 10 ข้อ · 5 ตัวเลือก<br>สูตรคะแนนชุดฝึก: หมวดละ 20 คะแนน รวม 100 คะแนน':'ชุด 1 ฝึกตาม Topic · ชุด 2 ทำข้อสอบจริงเต็มวิชาตามลำดับต้นฉบับ'}</p>${!isTPAT3&&data.member.can_study?`<button type="button" class="practice-primary alevel-hero-test" data-alevel-test="${esc(s.subject_id)}">⏱ ทดสอบเสมือนจริง · ${esc(String(s.duration_minutes))} นาที</button>`:''}${data.member.can_teach||data.member.can_manage?'<button type="button" class="secondary hero-exam-button" data-open-real-exam>จัดการสอบจริง</button>':''}</section>
  ${isTPAT3?`<section class="empty-state"><strong>${installation?.ready?'TPAT3 ชุด 1 พร้อมใช้งาน':'กำลังติดตั้ง TPAT3 ชุด 1'}</strong><p>โจทย์ ${installation?.question_count||0}/70 ข้อ · รูป ${installation?.image_count||0}/37 รูป · <a href="https://www.mytcas.com/blueprint/tpat3-30/" target="_blank" rel="noopener noreferrer">ดู Blueprint ↗</a></p>${!installation?.ready&&data.member.can_manage?'<button type="button" class="secondary" data-tpat3-install-images>ติดตั้งรูปประกอบ 37 รูป</button><p id="tpat3-install-status" role="status" aria-live="polite"></p>':''}<p>สูตรรายหมวดเป็นเกณฑ์ของชุดฝึกนี้ โครงสร้างทางการกำหนดส่วนที่ 1 รวม 60 คะแนน และส่วนที่ 2 รวม 40 คะแนน</p></section>`:''}
  <section class="stats"><div class="stat"><strong>${chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${s.imported_question_count || 0}</strong><span>ข้อที่นำเข้ารายข้อแล้ว</span></div><div class="stat"><strong>${completed}</strong><span>หัวข้อที่เรียนแล้ว</span></div></section>
  <section><div class="section-title"><div><h2>รายการหัวข้อเรียน</h2><p>${isTPAT3?'ฝึกตามหัวข้อหรือทำครบ 70 ข้อในชุด 1 · ส่งให้ผู้ดูแลตรวจ หรือเข้าสอบรอบที่ครูกำหนด':'ดูข้อสอบจริงรายหัวข้อ หรือเลือกชุด 1 เพื่อฝึกตาม Topic และชุด 2 เพื่อทำข้อสอบจริงทั้งวิชา ส่งให้ผู้ดูแลตรวจได้'}</p></div></div>
  <div id="learning-member-picker" class="learning-member-picker"></div><div class="search-row"><input type="search" id="alevel-search" aria-label="ค้นหาหัวข้อ A-Level" placeholder="ค้นหาชื่อหัวข้อ หรือรหัสหัวข้อ…"><select id="alevel-status-filter" aria-label="กรองสถานะ A-Level"><option value="all">ทุกสถานะ</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
  <p class="progress-note" id="alevel-progress-note"></p><div id="alevel-chapters"></div></section>`;
  document.querySelector('#alevel-search').addEventListener('input',e=>{alevelQuery=e.target.value;renderALevelTopics();});
  document.querySelector('#alevel-status-filter').addEventListener('change',e=>{alevelFilter=e.target.value;renderALevelTopics();});
  alevelData={...alevelData,subjects:alevelData.subjects.filter(x=>isTPAT3?x.subject_id==='TP30':x.subject_id!=='TP30'),chapters:alevelData.chapters.filter(x=>isTPAT3?x.subject_id==='TP30':x.subject_id!=='TP30'),topics:alevelData.topics.filter(x=>isTPAT3?x.subject_id==='TP30':x.subject_id!=='TP30')};
  practice = createPractice({
    main,
    data:alevelData,
    api:(path,options)=>api(path+(path.startsWith('/api/alevel')?`&exam_group=${isTPAT3?'tpat3':'alevel'}`:''),options),
    notice,
    rerender:renderALevelTopics,
    getSubject:()=>alevelSubject,
    apiPath:'/api/alevel',
    examGroup:isTPAT3?'tpat3':'alevel'
  });
  document.querySelector('#practice-dashboard').setAttribute('aria-label',`ผลการฝึก ${trackName} ของฉัน`);
  main.querySelector('[data-tpat3-install-images]')?.addEventListener('click',installTPAT3Images);
  renderALevelTopics();
  practice.refresh();
}

async function installTPAT3Images(event) {
  const button=event.currentTarget;
  button.disabled=true;
  const status=main.querySelector('#tpat3-install-status');
  try {
    const result=await api('/api/alevel?route=tpat3-status');
    for (const no of result.missing_images) {
      if(status) status.textContent=`กำลังติดตั้งรูปข้อ ${no}…`;
      await api('/api/alevel?route=tpat3-install-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question_no:no})});
    }
    if (main.contains(button)) await renderUniversityExam('TPAT3');
    notice('ติดตั้งรูป TPAT3 ชุด 1 ครบแล้ว');
  } catch(error) {
    if(status) status.textContent=error.message+' · กดติดตั้งอีกครั้งเพื่อทำต่อจากรูปที่ยังไม่เสร็จ';
    notice(error.message);
  } finally {button.disabled=false;}
}

function renderALevelTopics() {
  const root = document.querySelector('#alevel-chapters');
  if (!root || !alevelData) return;
  const existingChapters = [...root.querySelectorAll('[data-alevel-chapter]')];
  const openChapters = new Set(existingChapters.filter(c=>c.open).map(c=>c.dataset.alevelChapter));
  const hadChapters = existingChapters.length > 0;
  const progress = new Map((alevelData.viewedProgress || alevelData.progress).map(p=>[p.topic_id,p.status]));
  const allTopics = alevelData.topics.filter(t=>t.subject_id===alevelSubject);
  const completed = allTopics.filter(t=>progress.get(t.topic_id)==='completed').length;
  const note = document.querySelector('#alevel-progress-note');
  if (note) note.innerHTML = !alevelData.viewedStudent && !data.member.can_study ? 'เลือกนักเรียนด้านบนเพื่อดูสถานะล่าสุดประจำหัวข้อ' : `${esc(alevelData.viewedStudent?.member_name || data.member.member_name)} · เรียนแล้ว <strong>${completed} / ${allTopics.length}</strong> หัวข้อ · นักเรียนเป็นผู้บันทึกสถานะ`;
  const completedStat = main.querySelector('.stats .stat:last-child strong');
  if (completedStat) completedStat.textContent = !alevelData.viewedStudent && !data.member.can_study ? '—' : String(completed);
  const search = alevelQuery.trim().toLocaleLowerCase('th');
  const chapters = alevelData.chapters.filter(c=>c.subject_id===alevelSubject).map(c=>{
    const topics = allTopics.filter(t=>t.chapter_id===c.chapter_id
      && (!search || `${t.topic_id} ${t.topic_name_th} ${c.chapter_name_th}`.toLocaleLowerCase('th').includes(search))
      && (alevelFilter==='all' || (progress.get(t.topic_id)||'not_started')===alevelFilter));
    return {...c,topics};
  }).filter(c=>c.topics.length);
  root.innerHTML = chapters.length ? chapters.map((c,index)=>`<details class="chapter" data-alevel-chapter="${esc(c.chapter_id)}" ${search||openChapters.has(c.chapter_id)||(!hadChapters&&index===0)?'open':''}><summary><span class="chapter-code">${esc(c.chapter_id)}</span><span class="chapter-name">${esc(c.chapter_name_th)}</span><small>${c.topics.length} หัวข้อ</small></summary>${c.topics.map(t=>{
    const status = progress.get(t.topic_id)||'not_started';
    const q = Number(t.question_count || 0);
    return `<article class="topic"><div><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><span class="topic-name">${esc(t.topic_name_th)}</span>${topicLearningRoad(alevelData, t.topic_id)}</div><div class="topic-meta">${q ? `นำเข้า${alevelSubject==='TP30'?'โจทย์ชุด 1':'ข้อสอบจริง'}แล้ว ${q} ข้อ <button type="button" data-alevel-topic="${esc(t.topic_id)}">${alevelSubject==='TP30'?'ดูโจทย์':'ดูข้อสอบจริง'}</button>` : 'ยังไม่มีข้อสอบจริงในหัวข้อนี้'}</div>${practice?.topicAction(t)||''}</div>${data.member.can_study&&(!alevelData.viewedStudent||alevelData.viewedStudent.member_id===data.member.member_id)?`<select aria-label="สถานะ ${esc(t.topic_name_th)}" data-alevel-progress="${esc(t.topic_id)}">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select>`:''}</article>`;
  }).join('')}</details>`).join('') : '<div class="empty">ไม่พบหัวข้อที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
}

async function showALevelQuestions(id) {
  const topic = alevelData?.topics.find(t=>t.topic_id===id);
  document.querySelector('#detail-title').innerHTML = `<span class="learning-source-title">${esc(topic?.topic_name_th || 'ข้อสอบ A-Level')}</span> ${topicLearningRoad(alevelData, id)}`;
  document.querySelector('#detail-body').textContent = 'กำลังเปิดรายการ…';
  dialog.showModal();
  try {
    const result = await api('/api/alevel?route=questions&topic_id='+encodeURIComponent(id));
    if (!dialog.open) return;
    document.querySelector('#detail-body').innerHTML = result.questions.map(q=>{
      const choices = Array.isArray(q.choices) && q.choices.length ? `<ol>${q.choices.map(x=>`<li>${esc(typeof x==='string'?x:(x?.label ?? x?.text ?? JSON.stringify(x)))}</li>`).join('')}</ol>` : '';
      const answer = result.can_review && q.answer_key != null ? `<div class="key">เฉลยสำหรับครู/ผู้ดูแล: ${esc(typeof q.answer_key==='object'?JSON.stringify(q.answer_key):q.answer_key)}</div>` : '';
      const explanation = result.can_review && q.explanation ? `<p><strong>เฉลย:</strong> ${esc(q.explanation)}</p>` : '';
      const explanationMedia = result.can_review && q.explanation_image_url && mediaExplanationURL(q.explanation_image_url) ? `<p><img src="${esc(q.explanation_image_url)}" alt="ภาพประกอบเฉลย" style="max-width:100%;height:auto"></p>` : '';
      return `<article class="reference"><strong>${q.subject_id==='TP30'?'TPAT3 · ชุด 1':`พ.ศ. ${q.year_be}`} · ข้อ ${q.question_no}</strong><p>${esc(q.prompt)}</p>${choices}<small>${q.subject_id==='TP30'?'ข้อสอบแต่งใหม่ · 5 ตัวเลือก':`หน้า PDF ${q.source_page} · ${esc(q.question_type)}`}</small>${q.question_image_url?`<p><img src="${esc(freshQuestionImage(q.question_image_url))}" alt="รูปประกอบข้อ ${q.question_no}" style="max-width:100%;height:auto"></p>`:''}${answer}${explanation}${explanationMedia}${result.can_review&&data.member.can_manage?`<button type="button" class="secondary" data-explanation-edit="${esc(q.question_id)}" data-explanation-bank="reference">✎ แก้ไขเฉลยข้อนี้</button>`:''}</article>`;
    }).join('') || '<p>หัวข้อนี้ยังอยู่ระหว่างนำข้อสอบจาก PDF ปี 2568 เข้าระบบ</p>';
  } catch (error) {
    document.querySelector('#detail-body').textContent = error.message;
  }
}

function renderCatalogShell(areaTitle, levelLabel) {
  practice?.destroy(); practice=null;
  subject='ENG'; query=''; filter='all';
  main.innerHTML = `<section id="practice-dashboard" class="practice-dashboard" aria-label="ผลการฝึกของฉัน"></section>
  <section class="hero army-camo-hero"><button type="button" class="hero-back" data-back-area>← ${esc(areaTitle)}</button><span class="eyebrow">YOUR LEARNING SPACE</span><h1>${esc(levelLabel)}</h1><p>เลือกวิชา สำรวจหัวข้อ แล้วค่อย ๆ บันทึกการเรียนของตนเอง<br>รายการเนื้อหาจากข้อสอบเตรียมทหารในส่วนของกองทัพบก พ.ศ. 2562–2563</p>${data.member.can_teach||data.member.can_manage?'<button type="button" class="secondary hero-exam-button" data-open-real-exam>จัดการสอบจริง</button>':''}</section>
  <section class="stats" aria-label="ภาพรวมรายการเนื้อหา"><div class="stat"><strong>${data.subjects.length}</strong><span>วิชา</span></div><div class="stat"><strong>${data.chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${data.topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${data.question_count}</strong><span>ข้อในต้นฉบับ</span></div></section>
  <section id="military-self-tests" aria-label="ทดสอบชุดข้อสอบเตรียมทหาร"></section>
  <section><div class="section-title"><div><h2>รายการหัวข้อเรียน</h2><p>เริ่มจากวิชาที่สนใจ แล้วเลือกหมวดหรือค้นหาหัวข้อ</p></div>${data.member.can_manage?'<button type="button" class="secondary" id="members">สมาชิก School</button>':''}</div><nav class="tabs" aria-label="เลือกวิชา" id="subjects"></nav><div id="learning-member-picker" class="learning-member-picker"></div><div class="search-row"><input type="search" id="search" aria-label="ค้นหาหัวข้อเรียน" placeholder="ค้นหาชื่อหัวข้อ หรือรหัสหัวข้อ…"><select id="status-filter" aria-label="กรองสถานะการเรียน"><option value="all">ทุกสถานะ</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><p class="progress-note" id="progress-note"></p><div id="chapters"></div></section>`;
  document.querySelector('#search').addEventListener('input',event=>{query=event.target.value;renderCatalog();});
  document.querySelector('#status-filter').addEventListener('change',event=>{filter=event.target.value;renderCatalog();});
  document.querySelector('#members')?.addEventListener('click',showMembers);
  practice = createPractice({main,data,api,notice,rerender:renderCatalog,getSubject:()=>subject});
  renderCatalog();
  practice.refresh();
}

function renderCatalog() {
  const chaptersRoot = document.querySelector('#chapters');
  if (!chaptersRoot) return;
  const existingChapters = [...document.querySelectorAll("#chapters [data-chapter]")];
  const openChapters = new Set(existingChapters.filter(c=>c.open).map(c=>c.dataset.chapter));
  const hadSubject = existingChapters.some(c=>c.dataset.chapter.startsWith(subject+"-"));
  document.querySelector('#subjects').innerHTML = data.subjects.map(s=>`<button type="button" class="tab ${s.subject_id===subject?'active':''}" aria-pressed="${s.subject_id===subject}" data-subject="${esc(s.subject_id)}">${esc(s.subject_name_th)}</button>`).join('');
  const progress = new Map((data.viewedProgress || data.progress).map(p=>[p.topic_id,p.status]));
  const completed = (data.viewedProgress || data.progress).filter(p=>p.status==='completed').length;
  document.querySelector('#progress-note').innerHTML = !data.viewedStudent && !data.member.can_study ? 'เลือกนักเรียนด้านบนเพื่อดูสถานะล่าสุดประจำหัวข้อ' : `${esc(data.viewedStudent?.member_name || data.member.member_name)} · เรียนแล้ว <strong>${completed} / ${data.topics.length}</strong> หัวข้อ · นักเรียนเป็นผู้บันทึกสถานะ`;
  const search = query.trim().toLocaleLowerCase('th');
  const chapters = data.chapters.filter(c=>c.subject_id===subject).map(c=>{
    const topics = data.topics.filter(t=>t.chapter_id===c.chapter_id && (!search || `${t.topic_id} ${t.topic_name_th} ${c.chapter_name_th}`.toLocaleLowerCase('th').includes(search)) && (filter==='all'||(progress.get(t.topic_id)||'not_started')===filter));
    return { ...c, topics };
  }).filter(c=>c.topics.length);
  chaptersRoot.innerHTML = chapters.length ? chapters.map((c,index)=>`<details class="chapter" data-chapter="${esc(c.chapter_id)}" ${search||openChapters.has(c.chapter_id)||(!hadSubject&&index===0)?'open':''}><summary><span class="chapter-code">${esc(c.chapter_id)}</span><span class="chapter-name">${esc(c.chapter_name_th)}</span><small>${c.topics.length} หัวข้อ</small></summary>${c.topics.map(t=>{
    const status = progress.get(t.topic_id)||'not_started';
    return `<article class="topic"><div><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><span class="topic-name">${esc(t.topic_name_th)}</span>${topicLearningRoad(data, t.topic_id)}</div><div class="topic-meta">${t.counts.total?`พบเป็นหัวข้อหลัก ${t.counts.total} ข้อ · 2562: ${t.counts.year_2562} · 2563: ${t.counts.year_2563}<button type="button" data-topic="${esc(t.topic_id)}">ดูหน้าอ้างอิง</button>`:'ไม่พบเป็นหัวข้อหลักในสองชุดนี้'}</div>${practice?.topicAction(t)||''}</div>${data.member.can_study&&(!data.viewedStudent||data.viewedStudent.member_id===data.member.member_id)?`<select aria-label="สถานะ ${esc(t.topic_name_th)}" data-progress="${esc(t.topic_id)}">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select>`:''}</article>`;
  }).join('')}</details>`).join('') : '<div class="empty">ไม่พบหัวข้อที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
}


function localDateTime(value) {
  const d = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return [d.getFullYear(), p(d.getMonth() + 1), p(d.getDate())].join('-') + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function liveTimeLabel(iso) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
}

function liveCanJoin(item) {
  if (item.status !== 'scheduled') return false;
  if (data.member.can_manage || (data.member.can_teach && item.teacher_id === data.member.member_id)) return true;
  const now = Date.now();
  return now >= Date.parse(item.starts_at) - 15 * 60000 && now <= Date.parse(item.ends_at) + 15 * 60000;
}

async function showLiveRooms() {
  practice?.destroy(); practice=null; currentArea=null;
  main.innerHTML='<section class="empty-state"><strong>กำลังเปิดตารางเรียนสด…</strong></section>';
  try {
    liveData = await api('/api/school?route=live-classes');
    renderLiveRooms();
  } catch (error) {
    main.innerHTML='<section class="page-head"><button type="button" data-home class="back-link">← กลับหน้าแรก</button><h1>ห้องเรียนสด</h1></section><section class="empty-state"><strong>เปิดตารางเรียนไม่สำเร็จ</strong><p>' + esc(error.message) + '</p></section>';
  }
}

function renderLiveRooms() {
  const staff = Boolean(data.member.can_teach || data.member.can_manage);
  const items = liveData?.classes || [];
  const selected = items.find(c => c.class_id === liveEditingId && c.status === 'scheduled');
  if (!selected) liveEditingId=null;
  const starts = selected?.starts_at || null;
  const ends = selected?.ends_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const enroll = selected?.student_ids || [];
  const studentChoices = (liveData?.students || []).map(student =>
    '<label class="live-student-choice"><input type="checkbox" name="student_ids" value="' + esc(student.member_id) + '"' +
    (enroll.includes(student.member_id) ? ' checked' : '') + '><span>' + esc(student.member_name) + '</span></label>').join('');
  const editor = staff && !liveData.setup_required ? `
    <section class="live-editor">
      <div class="section-title"><div><h2>${selected?'แก้ไขห้องเรียนสด':'กำหนดห้องเรียนสด'}</h2><p>ครูเพิ่มลิงก์ Zoom และเลือกนักเรียนที่มีสิทธิ์เข้าร่วม</p></div></div>
      <form id="live-form" class="live-form">
        <label>ชื่อคาบเรียน<input name="title" required maxlength="160" placeholder="เช่น จปร. ติวเข้ม" value="${esc(selected?.title || '')}"></label>
        <label>เริ่มสอน<input name="starts_at" required type="datetime-local" value="${esc(localDateTime(starts))}"></label>
        <label>เลิกสอน<input name="ends_at" required type="datetime-local" value="${esc(localDateTime(ends))}"></label>
        <label class="live-wide">ลิงก์เข้าร่วม Zoom<input name="zoom_join_url" required type="url" autocomplete="off" placeholder="https://us05web.zoom.us/j/..." value="${esc(selected?.zoom_join_url || '')}"><small>คัดลอกจาก Zoom → Meetings → Copy Invitation (นำเฉพาะลิงก์ Join Zoom Meeting)</small></label>
        <fieldset class="live-wide"><legend>เลือกนักเรียนที่อนุญาตให้เข้าห้อง (${(liveData.students||[]).length} คน)</legend><div class="live-student-list">${studentChoices || '<p class="progress-note">ยังไม่มีสมาชิกที่ได้รับสิทธิ์นักเรียนจากวัด</p>'}</div></fieldset>
        <div class="live-wide live-editor-actions"><button type="submit" class="live-open-button">${selected?'บันทึกการแก้ไข':'สร้างคาบเรียน'}</button>${selected?'<button type="button" class="secondary" data-live-edit-cancel>ยกเลิกการแก้ไข</button>':''}</div>
      </form>
      <p class="live-note">School จะเก็บลิงก์ไว้ในฐานข้อมูลฝั่งเซิร์ฟเวอร์ นักเรียนจะรับลิงก์เมื่อกดเข้าเรียนตามเวลาที่กำหนด</p>
    </section>` : '';
  const cards = items.length ? items.map(c => {
    const cancelled = c.status === 'cancelled';
    const canJoin = liveCanJoin(c);
    const roster = c.student_ids || [];
    const clicked = c.join_clicks || [];
    return `<article class="live-class-card${cancelled?' is-cancelled':''}">
      <div class="live-card-top"><strong>${esc(c.title)}</strong><span class="live-status ${cancelled?'cancelled':canJoin?'live':'upcoming'}">${cancelled?'ยกเลิกแล้ว':canJoin?'เข้าห้องได้':'ตามตาราง'}</span></div>
      <p>📅 ${esc(liveTimeLabel(c.starts_at))} – ${esc(new Date(c.ends_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}))} น.</p>
      ${staff?'<p class="live-note">นักเรียนที่เลือก '+roster.length+' คน · กดเข้าผ่าน School แล้ว '+clicked.length+' คน (ไม่ใช่การยืนยันเวลาอยู่ใน Zoom)</p>':''}
      ${staff && roster.length ? '<details class="live-roster"><summary>ดูรายชื่อนักเรียน</summary><div>'+roster.map(id=>{const student=liveData.students.find(x=>x.member_id===id);return '<span>'+esc(student?.member_name||id)+' '+(clicked.some(x=>x.member_id===id)?'✓ กดเข้าห้องแล้ว':'— ยังไม่กด')+'</span>';}).join('')+'</div></details>':''}
      <div class="live-card-actions">
        ${!cancelled?'<button type="button" class="live-open-button" data-live-join="'+esc(c.class_id)+'"'+(canJoin?'':' disabled')+'>เปิดห้อง Zoom ↗</button>':''}
        ${staff&&!cancelled?'<button type="button" class="secondary" data-live-edit="'+esc(c.class_id)+'">แก้ไข</button><button type="button" class="secondary" data-live-cancel="'+esc(c.class_id)+'">ยกเลิกคาบ</button>':''}
      </div>
      ${!staff && !canJoin && !cancelled?'<small class="live-note">กดเข้าได้ตั้งแต่ 15 นาทีก่อนเริ่มจนถึง 15 นาทีหลังเวลาเลิก</small>':''}
    </article>`;
  }).join('') : '<div class="empty-state"><strong>ยังไม่มีคาบเรียนสด</strong><p>เมื่อครูเพิ่มตารางสอนและเลือกนักเรียนแล้ว คาบเรียนจะปรากฏที่นี่</p></div>';
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-home>← กลับหน้าแรก</button><span class="eyebrow">NATHOENG SCHOOL · ZOOM</span><h1>เรียนออนไลน์กับครู</h1><p>สอนสดผ่าน Zoom · เวลาแสดงตามเขตเวลาของอุปกรณ์ที่ใช้งาน</p></section>
  ${liveData?.setup_required ? '<section class="empty-state"><strong>รอเปิดระบบเรียนสด</strong><p>ผู้ดูแลต้องติดตั้ง supabase/School_Zoom_Live_Classes.sql ในฐานข้อมูล School ก่อน จึงจะเปิดตารางเรียนได้</p></section>' : editor + '<section><div class="section-title"><div><h2>ตารางเรียนสด</h2><p>ห้องเรียนสำหรับบัญชีที่ได้รับสิทธิ์เท่านั้น</p></div></div><div class="live-list">' + cards + '</div></section>'}`;
}

main.addEventListener('click',async event=>{
  const liveOpen=event.target.closest('[data-live-open]'); if(liveOpen){liveEditingId=null;await showLiveRooms();return;}
  const liveEdit=event.target.closest('[data-live-edit]'); if(liveEdit){liveEditingId=liveEdit.dataset.liveEdit;renderLiveRooms();main.querySelector('#live-form')?.scrollIntoView({block:'start'});return;}
  const liveEditCancel=event.target.closest('[data-live-edit-cancel]'); if(liveEditCancel){liveEditingId=null;renderLiveRooms();return;}
  const liveCancel=event.target.closest('[data-live-cancel]'); if(liveCancel){
    if(!window.confirm('ยกเลิกคาบเรียนนี้หรือไม่?'))return;
    liveCancel.disabled=true;
    try {await api('/api/school?route=live-cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class_id:liveCancel.dataset.liveCancel})});liveEditingId=null;await showLiveRooms();notice('ยกเลิกคาบเรียนแล้ว');}
    catch(error){notice(error.message);if(liveCancel.isConnected)liveCancel.disabled=false;}
    return;
  }
  const liveJoin=event.target.closest('[data-live-join]'); if(liveJoin){
    const popup=window.open('', '_blank');
    if(!popup){notice('กรุณาอนุญาตให้เบราว์เซอร์เปิดแท็บใหม่ก่อน');return;}
    popup.opener=null;popup.document.title='กำลังเปิด Zoom';popup.document.body.textContent='กำลังตรวจสิทธิ์เข้าห้อง Zoom…';
    liveJoin.disabled=true;
    try {const result=await api('/api/school?route=live-join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class_id:liveJoin.dataset.liveJoin})});popup.location.replace(result.join_url);}
    catch(error){popup.close();notice(error.message);}
    finally{if(liveJoin.isConnected)liveJoin.disabled=false;}
    return;
  }
  const m1Back=event.target.closest('[data-back-m1]'); if(m1Back){renderM1();return;}
  const m1Open=event.target.closest('[data-m1-so-open]'); if(m1Open){await renderM1SoPractice();return;}
  const m1Reports=event.target.closest('[data-m1-so-reports]'); if(m1Reports){await renderM1SoReports();return;}
  const m1Check=event.target.closest('[data-so-m1-check]'); if(m1Check){await checkM1SoPractice();return;}
  const m1Retry=event.target.closest('[data-so-m1-retry]'); if(m1Retry){await renderM1SoPractice();return;}
  const eq=event.target.closest('[data-explanation-question]');
  if(eq){await openExplanationQuestion(eq.dataset.explanationQuestion);return;}
  const ep=event.target.closest('[data-explanation-page]');
  if(ep){explanationState.page=Math.max(0,explanationState.page+Number(ep.dataset.explanationPage));await loadExplanationList();return;}
  const home=event.target.closest('[data-home]'); if(home){renderLearningHome();return;}
  const backArea=event.target.closest('[data-back-area]'); if(backArea){currentArea?renderArea(currentArea.id):renderLearningHome();return;}
  const backM6=event.target.closest('[data-m6]'); if(backM6){renderM6();return;}
  const backUniversity=event.target.closest('[data-university-prep]'); if(backUniversity){renderUniversityPrep();return;}
  const area=event.target.closest('[data-area]'); if(area){renderArea(area.dataset.area);return;}
  const level=event.target.closest('[data-level]'); if(level){openLevel(level.dataset.level);return;}
  const m6Path=event.target.closest('[data-m6-path]'); if(m6Path){
    if(m6Path.dataset.m6Path==='university') renderUniversityPrep();
    else renderUnavailable('เรียน ชั้นมัธยม','เรียนตามระดับชั้น ม.6');
    return;
  }
  const universityExam=event.target.closest('[data-university-exam]'); if(universityExam){
    if(universityExam.dataset.universityExam==='alevel') renderALevelSubjects();
    else renderUniversityExam(universityExam.dataset.universityExam);
    return;
  }
  const realExam=event.target.closest('[data-open-real-exam]'); if(realExam){practice?.openExamManager();return;}
  const mock=event.target.closest('[data-alevel-test]');
  if(mock){
    if(!data.member.can_study)return notice('เฉพาะนักเรียนที่มีสิทธิ์ School จึงเริ่มสอบได้');
    const id=mock.dataset.alevelTest; mock.disabled=true;
    try{
      if(!practice||alevelSubject!==id||!main.querySelector('#practice-dashboard'))await renderALevelCatalog(id);
      if(practice)await practice.openQuickExam(id);
    }catch(error){notice(error.message);}
    finally{if(mock.isConnected)mock.disabled=false;}
    return;
  }
  const alevelSubjectCard=event.target.closest('[data-alevel-subject]'); if(alevelSubjectCard){renderALevelCatalog(alevelSubjectCard.dataset.alevelSubject);return;}
  const alevelTopic=event.target.closest('[data-alevel-topic]'); if(alevelTopic){showALevelQuestions(alevelTopic.dataset.alevelTopic);return;}
  const tab=event.target.closest('[data-subject]'); if(tab){subject=tab.dataset.subject;renderCatalog();practice?.subjectChanged();return;}
  const topic=event.target.closest('[data-topic]'); if(topic)showQuestions(topic.dataset.topic);
});

main.addEventListener('submit',async event=>{
  const search=event.target.closest('#explanation-search-form');
  if(search){event.preventDefault();explanationState.search=search.elements.search.value.trim();explanationState.page=0;await loadExplanationList();return;}
  const form=event.target.closest('#explanation-edit-form');
  if(!form)return;
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]'),status=form.querySelector('#explanation-save-status');
  button.disabled=true;status.textContent='กำลังบันทึก…';
  try{
    await api('/api/school?route=explanation-editor-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      bank:explanationState.bank,question_id:form.elements.question_id.value,
      explanation:form.elements.explanation.value,reasoning:form.elements.reasoning.value,
      explanation_image_url:form.elements.explanation_image_url.value.trim()})});
    status.textContent='บันทึกแล้ว ✓';notice('บันทึกเฉลยสำเร็จ');await loadExplanationList();
  }catch(err){status.textContent=err.message;notice(err.message);}
  finally{if(button.isConnected)button.disabled=false;}
});
main.addEventListener('input',event=>{
  if(event.target.closest('#explanation-edit-form'))renderExplanationPreview();
});

main.addEventListener('submit', async event => {
  const form = event.target.closest('#live-form');
  if (!form) return;
  event.preventDefault();
  const payload = {
    class_id:liveEditingId || null,
    title:form.elements.title.value.trim(),
    starts_at:new Date(form.elements.starts_at.value).toISOString(),
    ends_at:new Date(form.elements.ends_at.value).toISOString(),
    zoom_join_url:form.elements.zoom_join_url.value.trim(),
    student_ids:[...form.querySelectorAll('input[name="student_ids"]:checked')].map(el=>el.value)
  };
  const submit=form.querySelector('button[type="submit"]'); submit.disabled=true;
  try {
    await api('/api/school?route=live-save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    liveEditingId=null;await showLiveRooms();notice('บันทึกตารางเรียนสดแล้ว');
  } catch(error){notice(error.message);}
  finally{if(submit.isConnected)submit.disabled=false;}
});

main.addEventListener('change',async event=>{
  if(event.target.id==='explanation-bank'){renderExplanationAdmin(event.target.value);return;}
  if(event.target.id==='explanation-set'||event.target.id==='explanation-subject'){
    explanationState.set=main.querySelector('#explanation-set')?.value||'';
    explanationState.subject=main.querySelector('#explanation-subject')?.value||'';
    explanationState.page=0;await loadExplanationList();return;
  }

  const alevelSelect=event.target.closest('[data-alevel-progress]');
  if(alevelSelect){
    const id=alevelSelect.dataset.alevelProgress, status=alevelSelect.value;
    main.querySelectorAll('[data-alevel-progress]').forEach(el=>{el.disabled=true;});
    practice?.beginLearningSave();
    try{
      await recordLearningProgress(alevelData, api, '/api/alevel', id, status);
      if(alevelData.viewedStudent?.member_id===data.member.member_id) alevelData.viewedProgress=alevelData.progress;
      renderALevelTopics();
      notice('บันทึกสถานะ A-Level แล้ว');
    }catch(error){notice(error.message);renderALevelTopics();}
    finally{practice?.learningChanged();}
    return;
  }
  const select=event.target.closest('[data-progress]'); if(!select)return;
  const id=select.dataset.progress, status=select.value;
  main.querySelectorAll('[data-progress]').forEach(el=>{el.disabled=true;});
  practice?.beginLearningSave();
  try {
    await recordLearningProgress(data, api, '/api/school', id, status);
    if(data.viewedStudent?.member_id===data.member.member_id) data.viewedProgress=data.progress;
    notice('บันทึกการเรียนแล้ว');
  } catch(error){notice(error.message);}
  finally{practice?.learningChanged();}
  renderCatalog();
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-explanation-edit]');
  if(!button||!data?.member?.can_manage)return;
  document.querySelector('#practice-dialog')?.close();
  renderExplanationAdmin(button.dataset.explanationBank||'army',button.dataset.explanationEdit);
});

async function showQuestions(id) {
  const topic=data.topics.find(t=>t.topic_id===id);
  document.querySelector('#detail-title').innerHTML=`<span class="learning-source-title">${esc(topic.topic_name_th)}</span> ${topicLearningRoad(data, id)}`;
  document.querySelector('#detail-body').textContent='กำลังเปิดรายการ…';
  dialog.showModal();
  try {
    const result=await api('/api/school?route=questions&topic_id='+encodeURIComponent(id));
    if(!dialog.open)return;
    document.querySelector('#detail-body').innerHTML=result.questions.map(q=>`<article class="reference"><strong>พ.ศ. ${q.year_be} · ข้อ ${q.exam_question_no}</strong><p>${esc(q.content_focus_th)}</p><small>EX62_63.pdf · หน้า PDF ${esc(q.pdf_pages.join(', '))} · หน้าพิมพ์ ${esc(q.printed_pages.join(', '))}</small>${q.answer_key?`<br><span class="key">เฉลยตามต้นฉบับ: ตัวเลือก ${q.answer_key}</span>`:''}</article>`).join('') || '<p>ยังไม่มีรายการข้อสอบหลักสำหรับหัวข้อนี้</p>';
  } catch(error){document.querySelector('#detail-body').textContent=error.message;}
}

async function showMembers() {
  document.querySelector('#detail-title').textContent='สมาชิก School';
  document.querySelector('#detail-body').textContent='กำลังเปิดรายชื่อ…';dialog.showModal();
  try {
    const result=await api('/api/school?route=members');
    document.querySelector('#detail-body').innerHTML=`<p class="progress-note">มอบหมายหรือถอนสิทธิ์ได้จากรายการสมาชิกบนเว็บไซต์วัด</p>${result.members.map(m=>`<div class="member-row"><strong>${esc(m.member_name)}</strong>${roles(m)}<small>${m.is_active?'ใช้งานอยู่':'ถอนสิทธิ์แล้ว'} · มอบหมาย ${esc(new Date(m.assigned_at).toLocaleDateString('th-TH'))}</small></div>`).join('')||'<p>ยังไม่มีสมาชิก</p>'}<p><a class="secondary" href="https://watt.nathoeng.com/">เปิดเว็บไซต์สมาชิกวัด ↗</a></p>`;
  } catch(error){document.querySelector('#detail-body').textContent=error.message;}
}
document.querySelector('#close-detail').addEventListener('click',()=>dialog.close());

try {
  data=await api('/api/school?route=catalog');
  const order=['ENG','MATH','SCI','THAI','SOC'];
  data.subjects.sort((a,b)=>order.indexOf(a.subject_id)-order.indexOf(b.subject_id));
  renderAccount();
  renderLearningHome();
} catch(error){
  welcome(error.status===401?'':error.message);
}
