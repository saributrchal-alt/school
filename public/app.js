import { createPractice } from './practice.js';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const dialog = document.querySelector('#detail');
const labels = { not_started:'ยังไม่เริ่ม', in_progress:'กำลังเรียน', review:'ทบทวน', completed:'เรียนแล้ว' };
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

let data, subject = 'ENG', query = '', filter = 'all', noticeTimer, practice, currentArea = null;
let alevelData = null, alevelSubject = 'AL61', alevelQuery = '', alevelFilter = 'all';
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
  main.innerHTML = `<section class="welcome"><div class="hero"><span class="eyebrow">NATHOENG SCHOOL</span><h1>เรียนรู้ไปด้วยกัน<br>เติบโตไปทีละเรื่อง</h1><p>พื้นที่เรียนรู้ของสมาชิกวัดพุทธอุทยานนาเทิง<br>รวมรายการหัวข้อเรียน และบันทึกการเรียนของตนเอง</p><a class="primary" href="https://watt.nathoeng.com/">เข้าสู่บัญชีสมาชิกวัด ↗</a></div>${message?`<p class="error" role="alert">${esc(message)}</p>`:''}<div class="steps"><strong>เข้า School ด้วยบัญชีสมาชิกเดิม</strong><br>1. ให้ผู้ดูแลวัดมอบสิทธิ์ School จากรายการสมาชิก<br>2. เปิด “บัญชีของฉัน” บนเว็บไซต์วัด<br>3. เลือก “การศึกษา School วัดนาเทิง”</div><p class="hint">เมื่อได้รับสิทธิ์แล้ว สามารถเข้า School จากเว็บไซต์วัดได้โดยไม่ต้องลงทะเบียนหรือล็อกอินอีกครั้ง</p></section>`;
}

function renderAccount() {
  account.innerHTML = `<span class="account-name">${esc(data.member.member_name)}</span><span>${roles(data.member)}</span><button type="button" id="logout">ออกจาก School</button>`;
  document.querySelector('#logout').addEventListener('click',async()=>{
    try{
      await api('/api/session?route=logout',{method:'POST'});
      practice?.destroy(); practice=null; data=null; welcome();
    }catch(error){notice(error.message);}
  });
}

function areaCard(area) {
  const ready = area.id === 'military-prep'
    ? '<span class="learning-ready">มีคลังข้อสอบแล้ว: ทหารบก (จปร.)</span>'
    : area.id === 'secondary'
      ? '<span class="learning-ready">มีคลังข้อสอบแล้ว: A-Level 2568</span>'
      : '<span class="learning-muted">อยู่ระหว่างการดำเนินงาน</span>';
  const bg = area.backgroundUrl || commonsImage(area.backgroundFile);
  const art = area.art ? learningCardArt[area.art] : '';
  const bgStyle = bg ? ` style="--card-bg:url('${esc(bg)}')"` : '';
  const mainTitle = String(area.title || '').replace(/^เรียน\s+/, '');
  return `<button type="button" class="learning-card ${bg?'has-bg':''} ${art?'has-art art-'+esc(area.art):''}" data-area="${esc(area.id)}"${bgStyle}>${art?`<span class="learning-card-art">${art}</span>`:''}<span class="learning-card-kicker">หมวดการเรียน</span><strong class="learning-title"><span class="learning-title-prefix">เรียน</span><span class="learning-title-main">${esc(mainTitle)}</span></strong><small>${esc(area.description)}</small>${ready}<span class="learning-arrow" aria-hidden="true">→</span></button>`;
}

function renderLearningHome() {
  practice?.destroy(); practice=null; currentArea=null;
  main.innerHTML = `<section class="hero learning-home-hero"><span class="eyebrow">NATHOENG SCHOOL</span><h1>เลือกประเภทการเรียน ฝึกฝน และทดสอบ</h1><p>เริ่มจากระดับหรือเส้นทางที่ต้องการ ระบบจะแยกเนื้อหาและแบบฝึกให้เป็นหมวดชัดเจน เพื่อให้ค้นหาและติดตามผลการเรียนได้ง่าย</p></section>
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
  if (!area.levels) return renderUnavailable(area.title, null);
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-home>← กลับประเภทการเรียน</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>${esc(area.title)}</h1><p>${esc(area.description)} — เลือกระดับหรือสายการเรียนที่ต้องการ</p></section>
  <section class="level-grid ${area.id==='military-prep'?'military-level-grid':''}">${area.levels.map(([id,label])=>{
    const hasContent = area.id === 'military-prep' && id === 'army';
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
  if (currentArea.id === 'secondary' && levelId === 'm6') {
    renderM6();
    return;
  }
  renderUnavailable(currentArea.title, label);
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
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-m6>← กลับ ม.6</button><span class="eyebrow">NATHOENG SCHOOL</span><h1>เตรียมสอบเข้ามหาวิทยาลัย</h1><p>เลือกประเภทข้อสอบที่ต้องการฝึกฝนและทดสอบ</p></section>
  <section class="level-grid">
    <button type="button" class="level-card" data-university-exam="alevel"><span><strong>A-Level</strong><small class="level-status ready">พร้อมใช้งาน · ปี 2568 · 315 ข้อ</small></span><b aria-hidden="true">→</b></button>
    <button type="button" class="level-card" data-university-exam="tgat"><span><strong>TGAT</strong><small class="level-status pending">อยู่ระหว่างการดำเนินงาน</small></span><b aria-hidden="true">→</b></button>
    <button type="button" class="level-card" data-university-exam="tpat"><span><strong>TPAT</strong><small class="level-status pending">อยู่ระหว่างการดำเนินงาน</small></span><b aria-hidden="true">→</b></button>
  </section>`;
}

async function renderALevelSubjects() {
  practice?.destroy(); practice=null;
  main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL</span><h1>ข้อสอบ A-Level</h1><p>ใช้หลักการเดียวกับคลังข้อสอบ จปร. — แยกวิชา หมวด หัวข้อ ข้อสอบต้นฉบับ และบันทึกความก้าวหน้ารายคน</p></section>
  <section class="empty-state"><strong>กำลังเปิดคลัง A-Level 2568…</strong><p>กำลังอ่านโครงสร้างรายวิชาและหัวข้อจากฐานข้อมูล School</p></section>`;
  try {
    const result = await api('/api/alevel?route=catalog');
    if (result.setup_required) {
      alevelData = null;
      main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL</span><h1>ข้อสอบ A-Level</h1><p>โครงสร้างระบบพร้อมแล้ว เหลือเปิดตาราง A-Level ใน Supabase</p></section>
      <section class="empty-state"><strong>ต้องรัน School_ALevel_schema.sql หนึ่งครั้ง</strong><p>หลังรัน SQL แล้ว หน้านี้จะแสดง 7 วิชา พร้อมหมวด หัวข้อ และคลังข้อสอบปี 2568 โดยไม่กระทบระบบ จปร. เดิม</p></section>`;
      return;
    }
    alevelData = result;
    const sourceTotal = result.source_question_count || 0;
    main.innerHTML = `<section class="page-head"><button type="button" class="back-link" data-university-prep>← กลับเตรียมสอบเข้ามหาวิทยาลัย</button><span class="eyebrow">A-LEVEL · 2568</span><h1>ข้อสอบ A-Level</h1><p>เลือกวิชาเพื่อเปิดหมวดและหัวข้อ เนื้อหาต้นฉบับรวม ${sourceTotal.toLocaleString('th-TH')} ข้อจาก 7 รายวิชา</p></section>
    <section class="stats" aria-label="ภาพรวม A-Level"><div class="stat"><strong>${result.subjects.length}</strong><span>วิชา</span></div><div class="stat"><strong>${result.chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${result.topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${result.question_count}</strong><span>ข้อที่นำเข้ารายข้อแล้ว</span></div></section>
    <section class="level-grid">${result.subjects.map(s=>{
      const imported = Number(s.imported_question_count || 0);
      const total = Number(s.source_question_count_2568 || 0);
      const status = imported ? `<small class="level-status ready">นำเข้าแล้ว ${imported}/${total} ข้อ</small>` : `<small class="level-status">ต้นฉบับ ${total} ข้อ · พร้อมจัดเข้าหัวข้อ</small>`;
      return `<button type="button" class="level-card" data-alevel-subject="${esc(s.subject_id)}"><span><strong>${esc(s.subject_name_th)}</strong>${status}</span><b aria-hidden="true">→</b></button>`;
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
  alevelQuery = '';
  alevelFilter = 'all';
  const source = alevelData.sources.find(x=>x.subject_id===subjectId);
  const chapters = alevelData.chapters.filter(x=>x.subject_id===subjectId);
  const topics = alevelData.topics.filter(x=>x.subject_id===subjectId);
  const progress = new Map(alevelData.progress.map(p=>[p.topic_id,p.status]));
  const completed = topics.filter(t=>progress.get(t.topic_id)==='completed').length;
  main.innerHTML = `<section id="practice-dashboard" class="practice-dashboard" aria-label="ผลการฝึก A-Level ของฉัน"></section>
  <section class="hero"><button type="button" class="hero-back" data-university-exam="alevel">← A-Level</button><span class="eyebrow">A-LEVEL · ${esc(String(s.subject_code))}</span><h1>${esc(s.subject_name_th)}</h1><p>ข้อสอบจริง พ.ศ. 2568 · ${esc(String(source?.question_count || s.source_question_count_2568))} ข้อ · ${esc(String(s.duration_minutes))} นาที<br>ชุด 1 ฝึกตาม Topic · ชุด 2 ทำข้อสอบจริงเต็มวิชาตามลำดับต้นฉบับ</p></section>
  <section class="stats"><div class="stat"><strong>${chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${s.imported_question_count || 0}</strong><span>ข้อที่นำเข้ารายข้อแล้ว</span></div><div class="stat"><strong>${completed}</strong><span>หัวข้อที่เรียนแล้ว</span></div></section>
  <section><div class="section-title"><div><h2>รายการหัวข้อเรียน</h2><p>ดูข้อสอบจริงรายหัวข้อ หรือเลือกชุด 1 เพื่อฝึกตาม Topic และชุด 2 เพื่อทำข้อสอบจริงทั้งวิชา ส่งให้ผู้ดูแลตรวจได้</p></div></div>
  <div class="search-row"><input type="search" id="alevel-search" aria-label="ค้นหาหัวข้อ A-Level" placeholder="ค้นหาชื่อหัวข้อ หรือรหัสหัวข้อ…"><select id="alevel-status-filter" aria-label="กรองสถานะ A-Level"><option value="all">ทุกสถานะ</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
  <p class="progress-note" id="alevel-progress-note"></p><div id="alevel-chapters"></div></section>`;
  document.querySelector('#alevel-search').addEventListener('input',e=>{alevelQuery=e.target.value;renderALevelTopics();});
  document.querySelector('#alevel-status-filter').addEventListener('change',e=>{alevelFilter=e.target.value;renderALevelTopics();});
  practice = createPractice({
    main,
    data:alevelData,
    api,
    notice,
    rerender:renderALevelTopics,
    getSubject:()=>alevelSubject,
    apiPath:'/api/alevel'
  });
  renderALevelTopics();
  practice.refresh();
}

function renderALevelTopics() {
  const root = document.querySelector('#alevel-chapters');
  if (!root || !alevelData) return;
  const existingChapters = [...root.querySelectorAll('[data-alevel-chapter]')];
  const openChapters = new Set(existingChapters.filter(c=>c.open).map(c=>c.dataset.alevelChapter));
  const hadChapters = existingChapters.length > 0;
  const progress = new Map(alevelData.progress.map(p=>[p.topic_id,p.status]));
  const allTopics = alevelData.topics.filter(t=>t.subject_id===alevelSubject);
  const completed = allTopics.filter(t=>progress.get(t.topic_id)==='completed').length;
  const note = document.querySelector('#alevel-progress-note');
  if (note) note.innerHTML = `บันทึกว่าเรียนแล้ว <strong>${completed} / ${allTopics.length}</strong> หัวข้อ · ข้อสอบจริง A-Level 2568 ครบแล้ว · ชุด 1 ฝึกครบทุก Topic · ชุด 2 เป็นข้อสอบจริงเต็มวิชา`;
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
    return `<article class="topic"><div><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><span class="topic-name">${esc(t.topic_name_th)}</span></div><div class="topic-meta">${q ? `นำเข้าข้อสอบจริงแล้ว ${q} ข้อ <button type="button" data-alevel-topic="${esc(t.topic_id)}">ดูข้อสอบจริง</button>` : 'ยังไม่มีข้อสอบจริงในหัวข้อนี้'}</div>${practice?.topicAction(t)||''}</div>${data.member.can_study?`<select aria-label="สถานะ ${esc(t.topic_name_th)}" data-alevel-progress="${esc(t.topic_id)}">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select>`:`<span class="status">${labels[status]}</span>`}</article>`;
  }).join('')}</details>`).join('') : '<div class="empty">ไม่พบหัวข้อที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
}

async function showALevelQuestions(id) {
  const topic = alevelData?.topics.find(t=>t.topic_id===id);
  document.querySelector('#detail-title').textContent = topic?.topic_name_th || 'ข้อสอบ A-Level';
  document.querySelector('#detail-body').textContent = 'กำลังเปิดรายการ…';
  dialog.showModal();
  try {
    const result = await api('/api/alevel?route=questions&topic_id='+encodeURIComponent(id));
    if (!dialog.open) return;
    document.querySelector('#detail-body').innerHTML = result.questions.map(q=>{
      const choices = Array.isArray(q.choices) && q.choices.length ? `<ol>${q.choices.map(x=>`<li>${esc(typeof x==='string'?x:(x?.label ?? x?.text ?? JSON.stringify(x)))}</li>`).join('')}</ol>` : '';
      const answer = result.can_review && q.answer_key != null ? `<div class="key">เฉลยสำหรับครู/ผู้ดูแล: ${esc(typeof q.answer_key==='object'?JSON.stringify(q.answer_key):q.answer_key)}</div>` : '';
      const explanation = result.can_review && q.explanation ? `<p><strong>เฉลย:</strong> ${esc(q.explanation)}</p>` : '';
      return `<article class="reference"><strong>พ.ศ. ${q.year_be} · ข้อ ${q.question_no}</strong><p>${esc(q.prompt)}</p>${choices}<small>หน้า PDF ${q.source_page} · ${esc(q.question_type)}</small>${q.question_image_url?`<p><img src="${esc(freshQuestionImage(q.question_image_url))}" alt="รูปประกอบข้อ ${q.question_no}" style="max-width:100%;height:auto"></p>`:''}${answer}${explanation}</article>`;
    }).join('') || '<p>หัวข้อนี้ยังอยู่ระหว่างนำข้อสอบจาก PDF ปี 2568 เข้าระบบ</p>';
  } catch (error) {
    document.querySelector('#detail-body').textContent = error.message;
  }
}

function renderCatalogShell(areaTitle, levelLabel) {
  practice?.destroy(); practice=null;
  subject='ENG'; query=''; filter='all';
  main.innerHTML = `<section id="practice-dashboard" class="practice-dashboard" aria-label="ผลการฝึกของฉัน"></section>
  <section class="hero"><button type="button" class="hero-back" data-back-area>← ${esc(areaTitle)}</button><span class="eyebrow">YOUR LEARNING SPACE</span><h1>${esc(levelLabel)}</h1><p>เลือกวิชา สำรวจหัวข้อ แล้วค่อย ๆ บันทึกการเรียนของตนเอง<br>รายการเนื้อหาจากข้อสอบเตรียมทหารในส่วนของกองทัพบก พ.ศ. 2562–2563</p></section>
  <section class="stats" aria-label="ภาพรวมรายการเนื้อหา"><div class="stat"><strong>${data.subjects.length}</strong><span>วิชา</span></div><div class="stat"><strong>${data.chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${data.topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${data.question_count}</strong><span>ข้อในต้นฉบับ</span></div></section>
  <section><div class="section-title"><div><h2>รายการหัวข้อเรียน</h2><p>เริ่มจากวิชาที่สนใจ แล้วเลือกหมวดหรือค้นหาหัวข้อ</p></div>${data.member.can_manage?'<button type="button" class="secondary" id="members">สมาชิก School</button>':''}</div><nav class="tabs" aria-label="เลือกวิชา" id="subjects"></nav><div class="search-row"><input type="search" id="search" aria-label="ค้นหาหัวข้อเรียน" placeholder="ค้นหาชื่อหัวข้อ หรือรหัสหัวข้อ…"><select id="status-filter" aria-label="กรองสถานะการเรียน"><option value="all">ทุกสถานะ</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><p class="progress-note" id="progress-note"></p><div id="chapters"></div></section>`;
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
  const progress = new Map(data.progress.map(p=>[p.topic_id,p.status]));
  const completed = data.progress.filter(p=>p.status==='completed').length;
  document.querySelector('#progress-note').innerHTML = `บันทึกว่าเรียนแล้ว <strong>${completed} / ${data.topics.length}</strong> หัวข้อ · สถานะนี้เป็นบันทึกของตนเอง`;
  const search = query.trim().toLocaleLowerCase('th');
  const chapters = data.chapters.filter(c=>c.subject_id===subject).map(c=>{
    const topics = data.topics.filter(t=>t.chapter_id===c.chapter_id && (!search || `${t.topic_id} ${t.topic_name_th} ${c.chapter_name_th}`.toLocaleLowerCase('th').includes(search)) && (filter==='all'||(progress.get(t.topic_id)||'not_started')===filter));
    return { ...c, topics };
  }).filter(c=>c.topics.length);
  chaptersRoot.innerHTML = chapters.length ? chapters.map((c,index)=>`<details class="chapter" data-chapter="${esc(c.chapter_id)}" ${search||openChapters.has(c.chapter_id)||(!hadSubject&&index===0)?'open':''}><summary><span class="chapter-code">${esc(c.chapter_id)}</span><span class="chapter-name">${esc(c.chapter_name_th)}</span><small>${c.topics.length} หัวข้อ</small></summary>${c.topics.map(t=>{
    const status = progress.get(t.topic_id)||'not_started';
    return `<article class="topic"><div><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><span class="topic-name">${esc(t.topic_name_th)}</span></div><div class="topic-meta">${t.counts.total?`พบเป็นหัวข้อหลัก ${t.counts.total} ข้อ · 2562: ${t.counts.year_2562} · 2563: ${t.counts.year_2563}<button type="button" data-topic="${esc(t.topic_id)}">ดูหน้าอ้างอิง</button>`:'ไม่พบเป็นหัวข้อหลักในสองชุดนี้'}</div>${practice?.topicAction(t)||''}</div>${data.member.can_study?`<select aria-label="สถานะ ${esc(t.topic_name_th)}" data-progress="${esc(t.topic_id)}">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select>`:`<span class="status">${labels[status]}</span>`}</article>`;
  }).join('')}</details>`).join('') : '<div class="empty">ไม่พบหัวข้อที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
}

main.addEventListener('click',event=>{
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
    else renderUnavailable('เตรียมสอบเข้ามหาวิทยาลัย', universityExam.dataset.universityExam.toUpperCase());
    return;
  }
  const alevelSubjectCard=event.target.closest('[data-alevel-subject]'); if(alevelSubjectCard){renderALevelCatalog(alevelSubjectCard.dataset.alevelSubject);return;}
  const alevelTopic=event.target.closest('[data-alevel-topic]'); if(alevelTopic){showALevelQuestions(alevelTopic.dataset.alevelTopic);return;}
  const tab=event.target.closest('[data-subject]'); if(tab){subject=tab.dataset.subject;renderCatalog();practice?.subjectChanged();return;}
  const topic=event.target.closest('[data-topic]'); if(topic)showQuestions(topic.dataset.topic);
});
main.addEventListener('change',async event=>{
  const alevelSelect=event.target.closest('[data-alevel-progress]');
  if(alevelSelect){
    const id=alevelSelect.dataset.alevelProgress, status=alevelSelect.value;
    alevelSelect.disabled=true;
    try{
      await api('/api/alevel?route=progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic_id:id,status})});
      const existing=alevelData?.progress.find(p=>p.topic_id===id);
      if(existing) existing.status=status; else alevelData?.progress.push({topic_id:id,status});
      renderALevelTopics();
      notice('บันทึกสถานะ A-Level แล้ว');
    }catch(error){notice(error.message);alevelSelect.disabled=false;}
    return;
  }
  const select=event.target.closest('[data-progress]'); if(!select)return;
  const id=select.dataset.progress, status=select.value;
  select.disabled=true;
  try {
    await api('/api/school?route=progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic_id:id,status})});
    const existing=data.progress.find(p=>p.topic_id===id); if(existing)existing.status=status;else data.progress.push({topic_id:id,status});
    notice('บันทึกการเรียนแล้ว');
  } catch(error){notice(error.message);}
  renderCatalog();
});

async function showQuestions(id) {
  const topic=data.topics.find(t=>t.topic_id===id);
  document.querySelector('#detail-title').textContent=topic.topic_name_th;
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
