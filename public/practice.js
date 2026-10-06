const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pct = (correct, total) => total ? `${Number((100 * correct / total).toFixed(1)).toLocaleString('th-TH')}%` : '—';
const QUESTION_IMAGE_REV = '20261006-crop2';
const freshQuestionImage = url => url ? `${url}${url.includes("?") ? "&" : "?"}v=${QUESTION_IMAGE_REV}` : '';

const stateLabel = { draft:'กำลังทำ', submitted:'รอตรวจ', graded:'ตรวจแล้ว' };
const setLabel = set => set?.source_type === 'original_exam' ? `ชุด ${Number(set.set_no)} · ข้อสอบจริง` : Number.isInteger(Number(set?.set_no)) ? `ชุด ${Number(set.set_no)}` : (set?.display_label || set?.label || '');
const setText = (sets, no) => setLabel((sets || []).find(s => s.set_no === no));

export function createPractice({ main, data, api, notice, rerender, getSubject, apiPath = '/api/practice' }) {
  const panel = document.querySelector('#practice-dashboard');
  const modal = document.querySelector('#practice-dialog');
  const modalBody = document.querySelector('#practice-body');
  let bank = null, selectedSet = 1, resultSubject = getSubject(), session = null, index = 0;
  let busy = false, viewingOther = false, loading = false, requestNo = 0, openTopics = false, openGrid = false;
  let choices = new Map(), saved = new Map(), modalError = '';
  let staffResults = null, staffStudentId = null, resultsQuery = '', resultsFilter = 'all', returnView = null;
  const subjectName = id => data.subjects.find(s => s.subject_id === id)?.subject_name_th || id;
  const topicName = id => data.topics.find(t => t.topic_id === id)?.topic_name_th || id;
  const canSeeResults = () => data.member.can_teach || data.member.can_manage;
  const date = value => value ? new Date(value).toLocaleString('th-TH') : '—';
  const resultButton = () => canSeeResults() ? '<button type="button" class="secondary" data-student-results>ผลตรวจรายคน</button>' : '';
  const post = (route, value) => api(`${apiPath}?route=${route}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) });
  const ownAttempt = sid => bank?.attempts?.find(a => a.set_no === selectedSet && a.subject_id === sid);
  const ownAnswers = sid => {
    const a = ownAttempt(sid);
    return a ? bank.answers.filter(x => x.attempt_id === a.attempt_id) : [];
  };

  function topicResult(topicId) {
    const questions = new Map((bank?.topics || []).map(q => [q.question_id, q]));
    const attempts = new Map((bank?.attempts || []).map(a => [a.attempt_id, a]));
    const answers = (bank?.answers || []).filter(x => questions.get(x.question_id)?.topic_id === topicId && attempts.get(x.attempt_id)?.status === 'graded');
    return { correct: answers.filter(x => x.is_correct).length, total: answers.length };
  }

  function topicAction(topic) {
    if (!bank?.ready) return '<span class="practice-topic-pending">กำลังเตรียมชุดฝึก</span>';
    const questions = bank.topics.filter(q => q.set_no === selectedSet && q.topic_id === topic.topic_id);
    if (!questions.length) return '';
    const a = ownAttempt(topic.subject_id), ids = new Set(questions.map(q => q.question_id));
    const answers = ownAnswers(topic.subject_id).filter(x => ids.has(x.question_id));
    let badge = '';
    if (a?.status === 'graded' && answers.length) {
      const correct = answers.filter(x => x.is_correct).length;
      badge = `<span class="practice-badge ${correct === answers.length ? 'correct' : 'incorrect'}">${correct}/${questions.length} ถูก · ${pct(correct, questions.length)}</span>`;
    } else if (answers.length) badge = `<span class="practice-badge answered">✓ ${answers.length}/${questions.length} ข้อ</span>`;
    const count = questions.length > 1 ? ` · ${questions.length} ข้อ` : '';
    return `<div class="practice-topic-action"><button type="button" class="practice-topic-button" data-practice="${esc(topic.topic_id)}">${a?.status === 'graded' ? 'ดูผล / เฉลย' : data.member.can_study ? 'ทำ' : 'ดู'}${setText(bank?.sets, selectedSet)}${count}</button>${badge}</div>`;
  }

  function renderPanel() {
    if (!bank) { panel.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดผลการฝึก…</p>'; return; }
    if (!bank.ready) {
      panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">PRACTICE</span><h2>กำลังเตรียมชุดฝึกใหม่</h2><p>กำลังเตรียมโจทย์และเฉลยสำหรับแต่ละหัวข้อ</p></div><div class="practice-toolbar"><button type="button" class="secondary" data-practice-refresh>ตรวจอีกครั้ง</button>${resultButton()}</div></div>`;
      return;
    }
    const graded = bank.attempts.filter(a => a.set_no === selectedSet && a.status === 'graded');
    const total = graded.reduce((n, a) => n + a.total_count, 0), correct = graded.reduce((n, a) => n + a.correct_count, 0);
    const availableSubjects = data.subjects.filter(s => bank.counts.some(c => c.set_no === selectedSet && c.subject_id === s.subject_id));
    const percent = total ? 100 * correct / total : 0;
    panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">MY PRACTICE</span><h2>ผลการฝึกของฉัน</h2><p>เห็นพัฒนาการทีละหัวข้อ · คะแนนเปิดเมื่อผู้ดูแลตรวจแล้ว</p></div><div class="practice-toolbar"><label class="practice-set-label">ชุดฝึก <select id="practice-set">${bank.sets.map(s => `<option value="${s.set_no}" ${s.set_no === selectedSet ? 'selected' : ''}>${esc(setLabel(s) || '—')}</option>`).join('')}</select></label><button type="button" class="secondary" data-practice-refresh ${loading ? 'disabled' : ''}>อัปเดตผล</button>${resultButton()}${data.member.can_manage ? '<button type="button" class="secondary" data-review>ตรวจคำตอบนักเรียน</button>' : ''}</div></div>
      <div class="practice-overview"><div class="practice-score-ring" style="--score:${percent}%"><strong>${pct(correct, total)}</strong><span>ความถูกต้องรวม</span></div><div class="practice-overview-text"><h3>${total ? `ทำถูก ${correct} จาก ${total} ข้อที่ตรวจแล้ว` : 'เริ่มจากหนึ่งหัวข้อ แล้วค่อย ๆ ก้าวหน้า'}</h3><p>ตรวจแล้ว <b>${graded.length} / ${availableSubjects.length}</b> วิชา${bank.attempts.some(a => a.set_no === selectedSet && a.status === 'submitted') ? ' · มีคำตอบรอตรวจ' : ''}</p><small>คำนวณจากจำนวนข้อที่ถูก ÷ จำนวนข้อที่ตรวจแล้วทั้งหมด</small><small>วิชาที่ยังไม่ตรวจจะแสดงสถานะและยังไม่รวมในเปอร์เซ็นต์</small></div></div>
      <div class="practice-subjects">${availableSubjects.map(s => {
        const a = ownAttempt(s.subject_id), n = ownAnswers(s.subject_id).length;
        const count = bank.counts.find(c => c.set_no === selectedSet && c.subject_id === s.subject_id).total_count;
        return `<button type="button" class="practice-subject ${a?.status === 'graded' ? 'is-graded' : ''}" data-practice-subject="${s.subject_id}"><span class="practice-subject-name">${esc(s.subject_name_th)}</span><strong>${a?.status === 'graded' ? pct(a.correct_count, a.total_count) : a?.status === 'submitted' ? 'รอตรวจ' : `${n} / ${count}`}</strong><span>${a?.status === 'graded' ? `ถูก ${a.correct_count} / ${a.total_count} ข้อ · ดูเฉลย ↗` : a?.status === 'submitted' ? 'ส่งคำตอบครบแล้ว' : n ? 'ตอบแล้ว · ทำต่อ ↗' : data.member.can_study ? 'เริ่มทำชุดนี้ ↗' : 'เปิดดูโจทย์ ↗'}</span><progress value="${n}" max="${count}" aria-label="ตอบแล้ว ${n} จาก ${count} ข้อ"></progress></button>`;
      }).join('')}</div>
      <details class="practice-topic-results" ${openTopics ? 'open' : ''}><summary>ผลรายหัวข้อ · รวมชุดที่ตรวจแล้ว</summary><div class="practice-result-tabs">${data.subjects.map(s => `<button type="button" class="tab ${s.subject_id === resultSubject ? 'active' : ''}" data-result-subject="${s.subject_id}" aria-pressed="${s.subject_id === resultSubject}">${esc(s.subject_name_th)}</button>`).join('')}</div><div class="practice-result-list">${data.topics.filter(t => t.subject_id === resultSubject).map(t => {
        const r = topicResult(t.topic_id);
        const hasQuestion = bank.topics.some(q => q.set_no === selectedSet && q.topic_id === t.topic_id);
        return `<div class="practice-result-row"><span><small>${esc(t.topic_id)}</small>${esc(t.topic_name_th)}</span><b class="${r.total ? r.correct === r.total ? 'correct-text' : 'review-text' : ''}">${pct(r.correct, r.total)}</b><small>${r.total ? `ถูก ${r.correct}/${r.total} ชุด` : 'ยังไม่มีผลตรวจ'}</small>${hasQuestion ? `<button type="button" data-practice="${esc(t.topic_id)}">${ownAttempt(t.subject_id)?.status === 'graded' ? 'ดูเฉลย' : 'เปิดโจทย์'} ↗</button>` : ''}</div>`;
      }).join('')}</div></details>
      ${bank.sets.length > 1 ? `<div class="practice-set-history"><h3>ความถูกต้องรวมแต่ละชุด</h3>${bank.sets.map(s => { const a = bank.attempts.filter(x => x.set_no === s.set_no && x.status === 'graded'); return `<span>${esc(setLabel(s) || '—')} <b>${pct(a.reduce((n, x) => n + x.correct_count, 0), a.reduce((n, x) => n + x.total_count, 0))}</b> <small>ตรวจแล้ว ${a.length} วิชา</small></span>`; }).join('')}</div>` : ''}`;
    panel.querySelector('.practice-topic-results').addEventListener('toggle', event => { openTopics = event.target.open; });
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      bank = await api(apiPath+'?route=summary');
      if (bank.ready && !bank.sets.some(s => s.set_no === selectedSet)) selectedSet = bank.sets[0].set_no;
      renderPanel(); rerender();
    } catch (error) {
      panel.innerHTML = `<div class="practice-heading"><div><h2>ผลการฝึกของฉัน</h2><p role="alert">${esc(error.message)}</p></div><button type="button" class="secondary" data-practice-refresh>ลองอีกครั้ง</button></div>`;
    } finally { loading = false; panel.querySelector('[data-practice-refresh]')?.removeAttribute('disabled'); }
  }

  async function openSubject(sid, topicId, otherAttempt, set = selectedSet) {
    if (busy) return;
    const ticket = ++requestNo;
    busy = true; viewingOther = Boolean(otherAttempt); session = null; modalError = ''; openGrid = false;
    document.querySelector('#practice-close').disabled = true;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดโจทย์…</p>';
    document.querySelector('#practice-title').textContent = `${subjectName(sid)} · ${setText(bank?.sets, set)}`;
    if (!modal.open) modal.showModal();
    try {
      if (data.member.can_study && !otherAttempt) await post('start', { set_no:set, subject_id:sid });
      const result = await api(`${apiPath}?route=subject&set_no=${set}&subject_id=${sid}${otherAttempt ? `&attempt_id=${encodeURIComponent(otherAttempt)}` : ''}`);
      if (!modal.open || ticket !== requestNo) return;
      session = result; saved = new Map(result.answers.map(a => [a.question_id, a]));
      choices = new Map(result.answers.map(a => [a.question_id, a.response ?? a.selected_answer]));
      index = topicId ? result.questions.findIndex(q => q.topic_id === topicId) : result.questions.findIndex(q => !saved.has(q.question_id));
      if (index < 0) index = 0;
      await refresh();
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; if (session && modal.open && ticket === requestNo) renderQuestion(); }
  }

  const editable = () => session?.attempt?.status === 'draft' && data.member.can_study && !viewingOther;
  function questionGrid() {
    return `<details class="practice-grid-wrap" ${openGrid ? 'open' : ''}><summary>ไปยังข้อ · เขียวหมายถึงบันทึกคำตอบแล้ว${session.attempt?.status === 'graded' ? ' · สีส้มควรทบทวน' : ''}</summary><div class="practice-question-grid">${session.questions.map((q, i) => {
      const a = saved.get(q.question_id), state = a ? session.attempt?.status === 'graded' && !a.is_correct ? 'incorrect' : 'answered' : '';
      return `<button type="button" class="${state} ${i === index ? 'current' : ''}" data-question-index="${i}" aria-label="ข้อ ${i + 1} ${esc(topicName(q.topic_id))}${a ? ', ตอบแล้ว' : ', ยังไม่ตอบ'}" ${busy ? 'disabled' : ''}>${i + 1}${a ? '<span aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('')}</div></details>`;
  }

  const responseOf = answer => answer?.response ?? answer?.selected_answer;
  const normalizedValues = key => Array.isArray(key) ? key : [key];
  const acceptedChoice = (key,value) => normalizedValues(key).some(x => Number(x) === Number(value));
  const hasResponse = (q,value) => {
    if (q.response_mode === 'complex') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      return (q.part_keys || []).every(k => [1,2].includes(Number(value[k])));
    }
    if (q.response_mode === 'numeric') return value !== undefined && value !== null && String(value).trim() !== '';
    return Number.isInteger(Number(value)) && Number(value) >= 1;
  };

  function answerKeyText(q) {
    if (!session?.can_review || q.answer_key == null) return '';
    if (q.response_mode === 'numeric') {
      return `<h4>เฉลย</h4><p class="practice-correct-answer">${esc(normalizedValues(q.answer_key).join(' หรือ '))}</p>`;
    }
    if (q.response_mode === 'complex') {
      const key=q.answer_key || {};
      return `<h4>เฉลย</h4><div class="practice-complex-key">${(q.part_keys || []).map((part,i)=>{
        const accepted=normalizedValues(key[part]).map(Number);
        const label=accepted.includes(1)&&accepted.includes(2)?'ยอมรับทั้ง ใช่ และ ไม่ใช่':accepted.includes(1)?'ใช่':'ไม่ใช่';
        return `<p><b>${esc(part)}</b> ${esc(q.choices?.[i] || '')}<span>${label}</span></p>`;
      }).join('')}</div>`;
    }
    const keys=normalizedValues(q.answer_key).map(Number).filter(Number.isFinite);
    return `<h4>เฉลย · ตัวเลือก ${esc(keys.join(' หรือ '))}</h4><div class="practice-correct-answer">${keys.map(k=>`<p>${k}. ${esc(q.choices?.[k-1] || '')}</p>`).join('')}</div>`;
  }

  function responseControl(q,selected) {
    if (q.response_mode === 'numeric') {
      return `<div class="practice-numeric-wrap"><label for="practice-numeric">ระบายคำตอบตัวเลข</label><input id="practice-numeric" class="practice-numeric-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(selected ?? '')}" placeholder="กรอกคำตอบ เช่น 1.28" ${!editable() || busy ? 'disabled' : ''}><small>กรอกเฉพาะค่าคำตอบ ระบบจะบันทึกเมื่อกดยืนยันหรือออกจากหน้าข้อนี้</small></div>`;
    }
    if (q.response_mode === 'complex') {
      const value=selected && typeof selected==='object' && !Array.isArray(selected) ? selected : {};
      return `<fieldset class="practice-complex"><legend>เลือก ใช่ / ไม่ใช่ ให้ครบทุกข้อความ</legend>${(q.part_keys || []).map((part,i)=>{
        const current=Number(value[part]);
        const key=session.can_review ? normalizedValues(q.answer_key?.[part]).map(Number) : [];
        const statement=q.choices?.[i] || part;
        return `<div class="practice-complex-item"><p><b>${esc(part)}</b> ${esc(statement)}</p><div class="practice-binary"><label class="${current===1?'selected':''} ${key.includes(1)?'answer-key':''}"><input type="radio" name="practice-part-${i}" data-part-key="${esc(part)}" value="1" ${current===1?'checked':''} ${!editable()||busy?'disabled':''}> ใช่</label><label class="${current===2?'selected':''} ${key.includes(2)?'answer-key':''}"><input type="radio" name="practice-part-${i}" data-part-key="${esc(part)}" value="2" ${current===2?'checked':''} ${!editable()||busy?'disabled':''}> ไม่ใช่</label></div></div>`;
      }).join('')}</fieldset>`;
    }
    return `<fieldset class="practice-choices"><legend class="sr-only">เลือกคำตอบหนึ่งตัวเลือก</legend>${q.choices.map((text,i)=>{
      const value=i+1, correct=session.can_review && acceptedChoice(q.answer_key,value);
      return `<label class="practice-choice ${Number(selected)===value?'selected':''} ${correct?'answer-key':''}"><input type="radio" name="practice-choice" id="practice-choice-${value}" value="${value}" ${Number(selected)===value?'checked':''} ${!editable()||busy?'disabled':''}><span class="practice-choice-number">${value}</span><span>${esc(text)}</span>${correct?'<b class="practice-choice-key">เฉลย</b>':''}</label>`;
    }).join('')}</fieldset>`;
  }

  function renderQuestion(focusChoice) {
    if (!session) return;
    const n = session.questions.length, a = session.attempt, status = a?.status;
    const label = setText(bank?.sets, session.set_no); document.querySelector('#practice-title').textContent = `${subjectName(session.subject_id)}${label ? ` · ${label}` : ''}${status ? ` · ${stateLabel[status]}` : ' · สำหรับครู'}`;
    document.querySelector('#practice-close').disabled = busy;
    const context = viewingOther ? `<div class="practice-student-context">${returnView ? '<button type="button" class="secondary" data-results-back>← กลับผลของนักเรียน</button>' : ''}<strong>${esc(session.student?.member_name || 'สมาชิก School')}</strong>${status === 'graded' ? `<small>ตรวจโดย ${esc(session.graded_by_name || '—')} · ${esc(date(a.graded_at))}</small>` : ''}</div>` : '';
    const header = `${context}<div class="practice-dialog-progress"><span>${status === 'graded' ? `ผลตรวจ ${pct(a.correct_count, a.total_count)} · ถูก ${a.correct_count}/${a.total_count}` : `บันทึกแล้ว ${saved.size} / ${n} ข้อ`}</span><progress value="${saved.size}" max="${n}" aria-label="บันทึกแล้ว ${saved.size} จาก ${n} ข้อ"></progress></div>`;
    const error = modalError ? `<p class="practice-inline-error" role="alert">${esc(modalError)}</p>` : '';
    if (index === n) {
      modalBody.innerHTML = `${header}<div class="practice-complete"><span class="eyebrow">SUBJECT SUMMARY</span><h3>${status === 'submitted' ? 'ส่งคำตอบครบแล้ว · รอตรวจ' : status === 'graded' ? 'ตรวจและเปิดผลแล้ว' : saved.size === n ? 'ตอบครบวิชานี้แล้ว' : `ยังเหลือ ${n - saved.size} ข้อ`}</h3><p>${status === 'submitted' ? 'เมื่อผู้ดูแลกดตรวจ จะเห็นคะแนนและเปิดเฉลยรายข้อได้' : status === 'graded' ? 'เลือกข้อด้านล่างเพื่อทบทวนคำตอบและเฉลย' : 'ส่งคำตอบทั้งวิชาเมื่อทำครบ หลังส่งคำตอบจะถูกล็อกจนผู้ดูแลตรวจและเปิดผล'}</p>${error}${editable() ? saved.size === n ? `<button type="button" class="practice-primary" data-submit ${busy ? 'disabled' : ''}>${busy ? 'กำลังส่ง…' : 'ส่งคำตอบครบทั้งวิชา'}</button>` : '<button type="button" class="practice-primary" data-unanswered>ไปข้อที่ยังไม่ตอบ</button>' : ''}<button type="button" class="secondary" data-question-index="0" ${busy ? 'disabled' : ''}>กลับไปดูข้อแรก</button>${status === 'submitted' && !viewingOther ? '<button type="button" class="secondary" data-update-subject>อัปเดตผลตรวจ</button>' : ''}</div>${questionGrid()}`;
      bindGrid();
      return;
    }
    const q = session.questions[index], answer = saved.get(q.question_id), selected = choices.get(q.question_id);
    const explanation = session.can_review && q.answer_key != null ? `<section class="practice-explanation"><span class="eyebrow">${status === 'graded' ? 'REVIEW & LEARN' : 'TEACHER NOTES'}</span>${answerKeyText(q)}<h4>วิธีทำ / การพิจารณา</h4><p>${esc(q.explanation)}</p><h4>เหตุผลและจุดที่ควรระวัง</h4><p>${esc(q.reasoning)}</p><small>${q.source_title ? esc(q.source_title) : 'โจทย์ฝึกตามหัวข้อต้นฉบับ'}${q.source_year ? ` · พ.ศ. ${esc(q.source_year)}` : ''}</small></section>` : '';
    const canNext=hasResponse(q,selected);
    modalBody.innerHTML = `${header}<div class="practice-question-heading"><span>${index + 1} / ${n} · ${esc(q.topic_id)}</span>${answer ? `<span class="practice-badge ${status === 'graded' ? answer.is_correct ? 'correct' : 'incorrect' : 'answered'}">${status === 'graded' ? answer.is_correct ? '✓ ตอบถูก' : 'ควรทบทวน' : '✓ บันทึกแล้ว'}</span>` : ''}<h3>${esc(topicName(q.topic_id))}</h3></div><p class="practice-prompt">${esc(q.prompt)}</p>${q.question_image_url ? `<figure class="practice-source-figure"><img src="${esc(freshQuestionImage(q.question_image_url))}" alt="ภาพประกอบข้อ ${esc(q.question_no || index + 1)}" loading="lazy"><figcaption>ภาพประกอบจากข้อสอบต้นฉบับ${q.question_no ? ` · ข้อ ${esc(q.question_no)}` : ''}</figcaption></figure>` : ''}${responseControl(q,selected)}<p class="practice-save-status" role="status">${busy ? 'กำลังบันทึกคำตอบ…' : editable() ? q.response_mode==='numeric' ? 'กรอกคำตอบแล้วกดยืนยันเพื่อบันทึกและไปข้อต่อไป' : q.response_mode==='complex' ? 'ตอบ ใช่ / ไม่ใช่ ให้ครบทุกข้อความ แล้วระบบจะบันทึกให้' : 'เลือกคำตอบแล้วระบบบันทึกให้ · กดยืนยันเพื่อไปข้อต่อไป' : status === 'submitted' ? 'ส่งแล้ว · คำตอบถูกล็อกระหว่างรอตรวจ' : status === 'graded' ? 'ดูคำตอบที่บันทึกและเฉลยด้านล่าง' : 'มุมมองครู · ดูโจทย์และเฉลยได้'}</p>${error}<div class="practice-navigation"><button type="button" class="secondary" data-back ${busy || index === 0 ? 'disabled' : ''}>← ย้อน</button>${editable() ? `<button type="button" class="secondary" data-skip ${busy ? 'disabled' : ''}>ข้าม →</button><button type="button" class="practice-primary" data-next ${busy || !canNext ? 'disabled' : ''}>${index === n - 1 ? 'ยืนยันคำตอบและสรุปวิชา' : 'ยืนยันคำตอบและไปข้อต่อไป →'}</button>` : `<button type="button" class="practice-primary" data-next ${busy ? 'disabled' : ''}>${index === n - 1 ? 'สรุปวิชา' : 'ข้อถัดไป →'}</button>`}</div>${explanation}${questionGrid()}${viewingOther && data.member.can_manage && status === 'submitted' ? `<div class="practice-grade-action"><p>ตรวจอัตโนมัติตามเฉลยและเปิดผลให้นักเรียนพร้อมกัน</p><button type="button" class="practice-primary" data-grade="${esc(a.attempt_id)}" ${busy ? 'disabled' : ''}>ตรวจและเปิดผล</button></div>` : ''}`;
    if (focusChoice) modalBody.querySelector(`#practice-choice-${focusChoice}`)?.focus();
    else modalBody.querySelector('.practice-question-heading h3')?.setAttribute('tabindex', '-1');
    bindGrid();
  }

  function bindGrid() {
    modalBody.querySelector('.practice-grid-wrap')?.addEventListener('toggle', event => { openGrid = event.target.open; });
  }

  async function saveResponse(question, value) {
    if (!editable() || busy || !hasResponse(question,value)) return false;
    const previous=responseOf(saved.get(question.question_id));
    if (JSON.stringify(previous) === JSON.stringify(value)) return true;
    busy = true; modalError = ''; renderQuestion();
    try {
      const payload={attempt_id:session.attempt.attempt_id,question_id:question.question_id};
      if(session.set_no===2) payload.response=value; else payload.selected_answer=Number(value);
      const result=await post('save',payload);
      const stored={question_id:question.question_id,response:result.item.response ?? value};
      if(question.response_mode==='choice') stored.selected_answer=Number(value);
      saved.set(question.question_id,stored);
      const a = bank.attempts.find(x => x.attempt_id === session.attempt.attempt_id);
      if (a) {
        const old = bank.answers.find(x => x.attempt_id === a.attempt_id && x.question_id === question.question_id);
        if (old) Object.assign(old,stored); else bank.answers.push({attempt_id:a.attempt_id,...stored});
      }
      renderPanel(); rerender();
      return true;
    } catch (error) { modalError = `${error.message} · กรุณากดยืนยันคำตอบเพื่อลองบันทึกอีกครั้ง`; return false; }
    finally { busy = false; if (modal.open) renderQuestion(question.response_mode==='choice'?Number(value):null); }
  }

  async function move(to) {
    if (busy || !session) return;
    if (editable() && index < session.questions.length) {
      const q = session.questions[index], value = choices.get(q.question_id);
      if (hasResponse(q,value) && !await saveResponse(q, value)) return;
    }
    index = Math.max(0, Math.min(to, session.questions.length)); modalError = ''; renderQuestion();
    modalBody.querySelector('.practice-question-heading h3')?.focus(); modal.scrollTop = 0;
  }

  async function closeModal() {
    if (busy) return;
    if (session && editable()) {
      const q = session.questions[index], value = q && choices.get(q.question_id);
      if (q && hasResponse(q,value) && !await saveResponse(q, value)) return;
    }
    requestNo++; modal.close(); session = null; returnView = null;
  }
  async function updateSubject() {
    if (!session || busy) return;
    busy = true; const previousIndex = index;
    try {
      session = await api(`${apiPath}?route=subject&set_no=${session.set_no}&subject_id=${session.subject_id}${viewingOther ? `&attempt_id=${session.attempt.attempt_id}` : ''}`);
      saved = new Map(session.answers.map(a => [a.question_id, a])); choices = new Map(session.answers.map(a => [a.question_id, a.response ?? a.selected_answer]));
      index = previousIndex; await refresh(); modalError = '';
    } catch (error) { modalError = error.message; }
    finally { busy = false; renderQuestion(); }
  }

  async function submitSubject() {
    if (!editable() || busy || saved.size !== session.questions.length) return;
    busy = true; modalError = ''; renderQuestion();
    try {
      session.attempt = (await post('submit', { attempt_id:session.attempt.attempt_id })).item;
      if (session.attempt.status === 'graded') {
        session = await api(`${apiPath}?route=subject&set_no=${session.set_no}&subject_id=${session.subject_id}`);
        saved = new Map(session.answers.map(a => [a.question_id, a]));
      }
      notice(session.attempt.status === 'graded' ? 'ผู้ดูแลตรวจและเปิดผลแล้ว' : 'ส่งคำตอบครบทั้งวิชาแล้ว · รอผู้ดูแลตรวจ');
      await refresh();
    }
    catch (error) { modalError = error.message; }
    finally { busy = false; renderQuestion(); }
  }

  function scores(attempts) {
    const graded = attempts.filter(a => a.status === 'graded');
    return { correct: graded.reduce((n, a) => n + a.correct_count, 0), total: graded.reduce((n, a) => n + a.total_count, 0),
      graded: graded.length, pending: attempts.filter(a => a.status === 'submitted').length,
      drafts: attempts.filter(a => a.status === 'draft').length };
  }

  function resultsToolbar() {
    return `<div class="practice-report-toolbar"><label class="practice-set-label">ชุดฝึก <select id="practice-results-set">${staffResults.sets.map(s => `<option value="${s.set_no}" ${s.set_no === staffResults.set_no ? 'selected' : ''}>${esc(setLabel(s) || '—')}${s.is_active ? '' : ' · ปิดแล้ว'}</option>`).join('')}</select></label><button type="button" class="secondary" data-results-refresh>อัปเดตผลรายคน</button></div>`;
  }

  function renderResultsList() {
    const query = resultsQuery.trim().toLocaleLowerCase('th');
    const students = staffResults.students.filter(s => {
      if (query && !`${s.member_name} ${s.member_id}`.toLocaleLowerCase('th').includes(query)) return false;
      return resultsFilter === 'all' || (resultsFilter === 'not_started' ? !s.attempts.length : s.attempts.some(a => a.status === resultsFilter));
    }).sort((a, b) => a.member_name.localeCompare(b.member_name, 'th'));
    modalBody.querySelector('#practice-results-count').textContent = `พบ ${students.length} จาก ${staffResults.students.length} คน`;
    modalBody.querySelector('#practice-results-list').innerHTML = students.length ? students.map(s => {
      const r = scores(s.attempts);
      return `<article class="practice-student-row"><div class="practice-student-name"><strong>${esc(s.member_name)}</strong><small>รหัสสมาชิก ${esc(s.member_id)}</small>${!s.is_active ? '<span class="practice-badge incorrect">ถอนสิทธิ์แล้ว · เก็บประวัติผลตรวจ</span>' : !s.can_study ? '<span class="practice-badge">ไม่มีสิทธิ์นักเรียนปัจจุบัน</span>' : ''}<span>${s.attempts.length ? `ตรวจแล้ว ${r.graded} วิชา · รอตรวจ ${r.pending} · กำลังทำ ${r.drafts}` : 'ยังไม่เริ่มชุดนี้'}</span></div><div class="practice-student-score"><strong>${pct(r.correct, r.total)}</strong><small>${r.total ? `ถูก ${r.correct} / ${r.total} ข้อ` : 'ยังไม่มีผลตรวจ'}</small></div><button type="button" class="secondary" data-student-id="${esc(s.member_id)}" aria-label="ดูผลของ ${esc(s.member_name)}">ดูผลรายคน ↗</button></article>`;
    }).join('') : '<div class="empty">ไม่พบนักเรียนที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
  }

  function renderResults() {
    session = null; viewingOther = false; returnView = null; staffStudentId = null;
    document.querySelector('#practice-title').textContent = 'ผลตรวจนักเรียนรายคน';
    const all = scores(staffResults.students.flatMap(s => s.attempts));
    modalBody.innerHTML = `${resultsToolbar()}<p class="practice-muted">เลือกนักเรียนเพื่อดูคะแนนแต่ละวิชาและคำตอบรายข้อ · เปอร์เซ็นต์รวมใช้เฉพาะข้อที่ตรวจแล้ว</p><div class="practice-report-stats"><span><b>${staffResults.students.length}</b> นักเรียน</span><span><b>${all.graded}</b> วิชาตรวจแล้ว</span><span><b>${all.pending}</b> วิชารอตรวจ</span></div><div class="practice-report-filters"><input type="search" id="practice-results-search" aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อนักเรียนหรือรหัสสมาชิก…" value="${esc(resultsQuery)}"><select id="practice-results-status" aria-label="กรองผลตรวจนักเรียน">${[['all','ทุกสถานะ'],['graded','มีผลตรวจแล้ว'],['submitted','มีคำตอบรอตรวจ'],['draft','กำลังทำ'],['not_started','ยังไม่เริ่ม']].map(([value,label]) => `<option value="${value}" ${value === resultsFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p id="practice-results-count" class="practice-muted" role="status" aria-live="polite"></p><div id="practice-results-list"></div>`;
    renderResultsList(); modal.scrollTop = 0;
  }

  function renderStudentResult(id) {
    const student = staffResults.students.find(s => s.member_id === id);
    if (!student) { renderResults(); return; }
    session = null; viewingOther = false; returnView = null; staffStudentId = id;
    document.querySelector('#practice-title').textContent = `${student.member_name} · ผลตรวจ`;
    const r = scores(student.attempts);
    const subjects = data.subjects.filter(s => staffResults.counts.some(c => c.subject_id === s.subject_id));
    modalBody.innerHTML = `<button type="button" class="secondary" data-results-list>← รายชื่อนักเรียน</button>${resultsToolbar()}<div class="practice-student-overview"><div><span class="eyebrow">STUDENT RESULTS</span><h3>${esc(student.member_name)}</h3><small>รหัสสมาชิก ${esc(student.member_id)}${student.is_active ? '' : ' · ถอนสิทธิ์แล้ว'}</small><p>ตรวจแล้ว ${r.graded} / ${subjects.length} วิชา · รอตรวจ ${r.pending} · กำลังทำ ${r.drafts}</p></div><div class="practice-student-score"><strong>${pct(r.correct, r.total)}</strong><small>${r.total ? `ถูก ${r.correct} / ${r.total} ข้อที่ตรวจแล้ว` : 'ยังไม่มีผลตรวจ'}</small></div></div><p class="practice-muted">ความถูกต้องรวม = ข้อที่ถูก ÷ ข้อที่ตรวจแล้วทั้งหมด · วิชาที่ยังไม่ตรวจยังไม่รวมในคะแนน</p><div class="practice-student-subjects">${subjects.map(s => {
      const a = student.attempts.find(x => x.subject_id === s.subject_id);
      const count = staffResults.counts.find(c => c.subject_id === s.subject_id).total_count;
      return `<article class="practice-student-subject"><div><h4>${esc(s.subject_name_th)}</h4><span class="practice-badge ${a?.status === 'graded' ? 'correct' : a?.status === 'submitted' ? 'incorrect' : ''}">${a ? stateLabel[a.status] : 'ยังไม่เริ่ม'}</span><p>${a?.status === 'graded' ? `<b>${pct(a.correct_count, a.total_count)}</b> · ถูก ${a.correct_count} / ${a.total_count} ข้อ` : `${a?.total_count || count} ข้อ · ยังไม่มีคะแนน`}</p>${a?.submitted_at ? `<small>ส่ง ${esc(date(a.submitted_at))}</small>` : ''}${a?.status === 'graded' ? `<small>ตรวจโดย ${esc(a.graded_by_name || '—')}</small><small>ตรวจ ${esc(date(a.graded_at))}</small>` : ''}</div><div class="practice-report-actions">${a && (a.status === 'graded' || a.status === 'submitted' && data.member.can_manage) ? `<button type="button" class="secondary" data-result-attempt="${esc(a.attempt_id)}" data-result-subject="${esc(s.subject_id)}">${a.status === 'graded' ? 'ดูคำตอบ / เฉลยรายข้อ' : 'ดูคำตอบ'}</button>` : ''}${a?.status === 'submitted' && data.member.can_manage ? `<button type="button" class="practice-primary" data-grade="${esc(a.attempt_id)}">ตรวจและเปิดผล</button>` : ''}</div></article>`;
    }).join('') || '<div class="empty">กำลังเตรียมโจทย์สำหรับชุดนี้</div>'}</div>`;
    modal.scrollTop = 0;
  }

  async function openResults(set = selectedSet, studentId = null) {
    if (busy || !canSeeResults()) return;
    const ticket = ++requestNo;
    busy = true; session = null; returnView = null;
    document.querySelector('#practice-title').textContent = 'ผลตรวจนักเรียนรายคน';
    document.querySelector('#practice-close').disabled = true;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดผลตรวจรายคน…</p>';
    if (!modal.open) modal.showModal();
    try {
      const result = await api(`${apiPath}?route=results&set_no=${set}`);
      if (!modal.open || ticket !== requestNo) return;
      staffResults = result;
      if (studentId) renderStudentResult(studentId); else renderResults();
    } catch (error) {
      if (modal.open && ticket === requestNo) modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-results-retry="${set}">ลองอีกครั้ง</button>`;
    } finally { busy = false; document.querySelector('#practice-close').disabled = false; }
  }

  async function openReview() {
    if (busy || !data.member.can_manage) return;
    requestNo++; busy = true; session = null; returnView = null; staffStudentId = null;
    document.querySelector('#practice-title').textContent = 'คำตอบนักเรียน · รอตรวจ';
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดรายการ…</p>'; if (!modal.open) modal.showModal();
    try {
      const result = await api(apiPath+'?route=review');
      modalBody.innerHTML = `<p class="practice-muted">กดตรวจเพื่อให้ระบบเทียบเฉลย คำนวณคะแนน และเปิดผลให้นักเรียน</p>${result.attempts.length ? result.attempts.map(a => `<article class="practice-review-row"><div><strong>${esc(a.member_name)}</strong><span>${esc(subjectName(a.subject_id))}${setText(bank?.sets, a.set_no) ? ` · ${esc(setText(bank?.sets, a.set_no))}` : ''} · ${a.total_count} ข้อ</span><small>ส่ง ${esc(new Date(a.submitted_at).toLocaleString('th-TH'))}</small></div><div><button type="button" class="secondary" data-review-open="${a.attempt_id}" data-review-set="${a.set_no}" data-review-subject="${a.subject_id}">ดูคำตอบ</button><button type="button" class="practice-primary" data-grade="${a.attempt_id}">ตรวจและเปิดผล</button></div></article>`).join('') : '<div class="empty">ไม่มีคำตอบรอตรวจในขณะนี้</div>'}`;
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; }
  }

  async function grade(id, button) {
    if (busy || !data.member.can_manage) return;
    busy = true; button.disabled = true; button.textContent = 'กำลังตรวจ…';
    try {
      await post('grade', { attempt_id:id }); notice('ตรวจและเปิดคะแนนกับเฉลยให้นักเรียนแล้ว');
      busy = false;
      if (session) await updateSubject(); else if (staffStudentId && staffResults) await openResults(staffResults.set_no, staffStudentId); else await openReview();
      await refresh();
    } catch (error) { busy = false; notice(error.message); button.disabled = false; button.textContent = 'ตรวจและเปิดผล'; }
  }

  const mainClick = event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.practice) {
      const topic = data.topics.find(t => t.topic_id === target.dataset.practice); if (topic) openSubject(topic.subject_id, topic.topic_id);
    } else if (target.dataset.practiceSubject) openSubject(target.dataset.practiceSubject);
    else if (target.hasAttribute('data-practice-refresh')) refresh();
    else if (target.hasAttribute('data-student-results')) { resultsQuery = ''; resultsFilter = 'all'; openResults(); }
    else if (target.hasAttribute('data-review')) openReview();
    else if (target.dataset.resultSubject) { resultSubject = target.dataset.resultSubject; renderPanel(); }
  };
  const setChange = event => { if (event.target.id === 'practice-set') { selectedSet = Number(event.target.value); renderPanel(); rerender(); } };
  const modalClick = event => {
    const t = event.target.closest('button'); if (!t || busy) return;
    if (t.dataset.questionIndex !== undefined) move(Number(t.dataset.questionIndex));
    else if (t.hasAttribute('data-back')) move(index - 1);
    else if (t.hasAttribute('data-next') || t.hasAttribute('data-skip')) move(index + 1);
    else if (t.hasAttribute('data-unanswered')) move(session.questions.findIndex(q => !saved.has(q.question_id)));
    else if (t.hasAttribute('data-submit')) submitSubject();
    else if (t.hasAttribute('data-update-subject')) updateSubject();
    else if (t.dataset.studentId) renderStudentResult(t.dataset.studentId);
    else if (t.hasAttribute('data-results-list')) renderResults();
    else if (t.hasAttribute('data-results-refresh')) openResults(staffResults.set_no, staffStudentId);
    else if (t.dataset.resultsRetry) openResults(Number(t.dataset.resultsRetry));
    else if (t.hasAttribute('data-results-back') && returnView) openResults(returnView.set_no, returnView.member_id);
    else if (t.dataset.resultAttempt) { returnView = { set_no:staffResults.set_no, member_id:staffStudentId }; openSubject(t.dataset.resultSubject, null, t.dataset.resultAttempt, staffResults.set_no); }
    else if (t.dataset.reviewOpen) openSubject(t.dataset.reviewSubject, null, t.dataset.reviewOpen, Number(t.dataset.reviewSet));
    else if (t.dataset.grade) grade(t.dataset.grade, t);
  };
  const choiceChange = event => {
    if (event.target.id === 'practice-results-set') { openResults(Number(event.target.value), staffStudentId); return; }
    if (event.target.id === 'practice-results-status') { resultsFilter = event.target.value; renderResultsList(); return; }
    if (!editable() || busy || !session || index >= session.questions.length) return;
    const q=session.questions[index];
    if (event.target.name === 'practice-choice') {
      const value=Number(event.target.value); choices.set(q.question_id,value); saveResponse(q,value); return;
    }
    if (event.target.dataset.partKey) {
      const current=choices.get(q.question_id);
      const value=current && typeof current==='object' && !Array.isArray(current) ? {...current} : {};
      value[event.target.dataset.partKey]=Number(event.target.value); choices.set(q.question_id,value);
      const next=modalBody.querySelector('[data-next]'); if(next) next.disabled=!hasResponse(q,value);
      if(hasResponse(q,value)) saveResponse(q,value);
    }
  };
  const resultsSearch = event => {
    if (event.target.id === 'practice-results-search') { resultsQuery = event.target.value; renderResultsList(); return; }
    if (event.target.id === 'practice-numeric' && editable() && session && index < session.questions.length) {
      const q=session.questions[index], value=event.target.value; choices.set(q.question_id,value);
      const next=modalBody.querySelector('[data-next]'); if(next) next.disabled=!hasResponse(q,value);
    }
  };
  const cancel = event => { event.preventDefault(); closeModal(); };
  main.addEventListener('click', mainClick); main.addEventListener('change', setChange);
  modalBody.addEventListener('click', modalClick); modalBody.addEventListener('change', choiceChange);
  modalBody.addEventListener('input', resultsSearch);
  modal.addEventListener('cancel', cancel); document.querySelector('#practice-close').addEventListener('click', closeModal);
  renderPanel();
  return { refresh, topicAction, subjectChanged() { resultSubject = getSubject(); if (bank?.ready) renderPanel(); }, destroy() {
    requestNo++; main.removeEventListener('click', mainClick); main.removeEventListener('change', setChange);
    modalBody.removeEventListener('click', modalClick); modalBody.removeEventListener('change', choiceChange);
    modalBody.removeEventListener('input', resultsSearch);
    modal.removeEventListener('cancel', cancel); document.querySelector('#practice-close').removeEventListener('click', closeModal);
    modal.close(); session = null;
  } };
}
