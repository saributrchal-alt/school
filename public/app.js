import { createPractice } from './practice.js';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const dialog = document.querySelector('#detail');
const labels = { not_started:'ยังไม่เริ่ม', in_progress:'กำลังเรียน', review:'ทบทวน', completed:'เรียนแล้ว' };
let data, subject = 'ENG', query = '', filter = 'all', noticeTimer, practice;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = member => [member.can_study?'นักเรียน':'',member.can_teach?'ครู / ผู้สอน':'',member.can_manage?'ผู้ดูแล':''].filter(Boolean).map(x=>`<span class="role">${x}</span>`).join('');

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
  account.innerHTML = '';
  main.innerHTML = `<section class="welcome"><div class="hero"><span class="eyebrow">NATHOENG SCHOOL</span><h1>เรียนรู้ไปด้วยกัน<br>เติบโตไปทีละเรื่อง</h1><p>พื้นที่เรียนรู้ของสมาชิกวัดพุทธอุทยานนาเทิง<br>รวมรายการหัวข้อเรียน และบันทึกการเรียนของตนเอง</p><a class="primary" href="https://watt.nathoeng.com/">เข้าสู่บัญชีสมาชิกวัด ↗</a></div>${message?`<p class="error" role="alert">${esc(message)}</p>`:''}<div class="steps"><strong>เข้า School ด้วยบัญชีสมาชิกเดิม</strong><br>1. ให้ผู้ดูแลวัดมอบสิทธิ์ School จากรายการสมาชิก<br>2. เปิด “บัญชีของฉัน” บนเว็บไซต์วัด<br>3. เลือก “การศึกษา School วัดนาเทิง”</div><p class="hint">เมื่อได้รับสิทธิ์แล้ว สามารถเข้า School จากเว็บไซต์วัดได้โดยไม่ต้องลงทะเบียนหรือล็อกอินอีกครั้ง</p></section>`;
}

function renderShell() {
  account.innerHTML = `<span class="account-name">${esc(data.member.member_name)}</span><span>${roles(data.member)}</span><button type="button" id="logout">ออกจาก School</button>`;
  main.innerHTML = `<section id="practice-dashboard" class="practice-dashboard" aria-label="ผลการฝึกของฉัน"></section><section class="hero"><span class="eyebrow">YOUR LEARNING SPACE</span><h1>วันนี้ เรียนรู้เพิ่มอีกหนึ่งเรื่อง</h1><p>เลือกวิชา สำรวจหัวข้อ แล้วค่อย ๆ บันทึกการเรียนของตนเอง<br>รายการเนื้อหาจากข้อสอบเตรียมทหารในส่วนของกองทัพบก พ.ศ. 2562–2563</p></section><section class="stats" aria-label="ภาพรวมรายการเนื้อหา"><div class="stat"><strong>${data.subjects.length}</strong><span>วิชา</span></div><div class="stat"><strong>${data.chapters.length}</strong><span>หมวด</span></div><div class="stat"><strong>${data.topics.length}</strong><span>หัวข้อ</span></div><div class="stat"><strong>${data.question_count}</strong><span>ข้อในต้นฉบับ</span></div></section><section><div class="section-title"><div><h2>รายการหัวข้อเรียน</h2><p>เริ่มจากวิชาที่สนใจ แล้วเลือกหมวดหรือค้นหาหัวข้อ</p></div>${data.member.can_manage?'<button type="button" class="secondary" id="members">สมาชิก School</button>':''}</div><nav class="tabs" aria-label="เลือกวิชา" id="subjects"></nav><div class="search-row"><input type="search" id="search" aria-label="ค้นหาหัวข้อเรียน" placeholder="ค้นหาชื่อหัวข้อ หรือรหัสหัวข้อ…"><select id="status-filter" aria-label="กรองสถานะการเรียน"><option value="all">ทุกสถานะ</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><p class="progress-note" id="progress-note"></p><div id="chapters"></div></section>`;
  document.querySelector('#search').addEventListener('input',event=>{query=event.target.value;renderCatalog();});
  document.querySelector('#status-filter').addEventListener('change',event=>{filter=event.target.value;renderCatalog();});
  document.querySelector('#logout').addEventListener('click',async()=>{try{await api('/api/session?route=logout',{method:'POST'});practice?.destroy();practice=null;data=null;welcome();}catch(error){notice(error.message);}});
  document.querySelector('#members')?.addEventListener('click',showMembers);
  practice = createPractice({main,data,api,notice,rerender:renderCatalog,getSubject:()=>subject});
  renderCatalog();
  practice.refresh();
}

function renderCatalog() {
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
  document.querySelector('#chapters').innerHTML = chapters.length ? chapters.map((c,index)=>`<details class="chapter" data-chapter="${esc(c.chapter_id)}" ${search||openChapters.has(c.chapter_id)||(!hadSubject&&index===0)?'open':''}><summary><span class="chapter-code">${esc(c.chapter_id)}</span><span class="chapter-name">${esc(c.chapter_name_th)}</span><small>${c.topics.length} หัวข้อ</small></summary>${c.topics.map(t=>{
    const status = progress.get(t.topic_id)||'not_started';
    return `<article class="topic"><div><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><span class="topic-name">${esc(t.topic_name_th)}</span></div><div class="topic-meta">${t.counts.total?`พบเป็นหัวข้อหลัก ${t.counts.total} ข้อ · 2562: ${t.counts.year_2562} · 2563: ${t.counts.year_2563}<button type="button" data-topic="${esc(t.topic_id)}">ดูหน้าอ้างอิง</button>`:'ไม่พบเป็นหัวข้อหลักในสองชุดนี้'}</div>${practice?.topicAction(t)||''}</div>${data.member.can_study?`<select aria-label="สถานะ ${esc(t.topic_name_th)}" data-progress="${esc(t.topic_id)}">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select>`:`<span class="status">${labels[status]}</span>`}</article>`;
  }).join('')}</details>`).join('') : '<div class="empty">ไม่พบหัวข้อที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
}

main.addEventListener('click',event=>{
  const tab=event.target.closest('[data-subject]'); if(tab){subject=tab.dataset.subject;renderCatalog();practice?.subjectChanged();}
  const topic=event.target.closest('[data-topic]'); if(topic)showQuestions(topic.dataset.topic);
});
main.addEventListener('change',async event=>{
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
try { data=await api('/api/school?route=catalog');const order=['ENG','MATH','SCI','THAI','SOC'];data.subjects.sort((a,b)=>order.indexOf(a.subject_id)-order.indexOf(b.subject_id));renderShell(); }
catch(error){welcome(error.status===401?'':error.message);}
