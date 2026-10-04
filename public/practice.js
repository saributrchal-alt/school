const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pct = (correct, total) => total ? `${Number((100 * correct / total).toFixed(1)).toLocaleString('th-TH')}%` : '—';
const stateLabel = { draft:'กำลังทำ', submitted:'รอตรวจ', graded:'ตรวจแล้ว' };

export function createPractice({ main, data, api, notice, rerender, getSubject }) {
  const panel = document.querySelector('#practice-dashboard');
  const modal = document.querySelector('#practice-dialog');
  const modalBody = document.querySelector('#practice-body');
  let bank = null, selectedSet = 1, resultSubject = getSubject(), session = null, index = 0;
  let busy = false, viewingOther = false, loading = false, requestNo = 0, openTopics = false, openGrid = false;
  let choices = new Map(), saved = new Map(), modalError = '';
  const subjectName = id => data.subjects.find(s => s.subject_id === id)?.subject_name_th || id;
  const topicName = id => data.topics.find(t => t.topic_id === id)?.topic_name_th || id;
  const post = (route, value) => api(`/api/practice?route=${route}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) });
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
    if (!bank?.ready) return '<span class="practice-topic-pending">ชุดฝึกที่ 1 · กำลังเตรียม</span>';
    const question = bank.topics.find(q => q.set_no === selectedSet && q.topic_id === topic.topic_id);
    if (!question) return '';
    const a = ownAttempt(topic.subject_id), answer = ownAnswers(topic.subject_id).find(x => x.question_id === question.question_id);
    let badge = '';
    if (a?.status === 'graded' && answer) badge = `<span class="practice-badge ${answer.is_correct ? 'correct' : 'incorrect'}">${answer.is_correct ? 'ถูก' : 'ควรทบทวน'} · ${answer.is_correct ? '100%' : '0%'}</span>`;
    else if (answer) badge = '<span class="practice-badge answered">✓ ตอบแล้ว</span>';
    return `<div class="practice-topic-action"><button type="button" class="practice-topic-button" data-practice="${esc(topic.topic_id)}">${a?.status === 'graded' ? 'ดูผล / เฉลย' : data.member.can_study ? 'ทำ' : 'ดู'}ชุดที่ ${selectedSet}</button>${badge}</div>`;
  }

  function renderPanel() {
    if (!bank) { panel.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดผลการฝึก…</p>'; return; }
    if (!bank.ready) {
      panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">PRACTICE</span><h2>ชุดฝึกใหม่ · ชุดที่ 1</h2><p>กำลังเตรียมโจทย์และเฉลยสำหรับแต่ละหัวข้อ</p></div><button type="button" class="secondary" data-practice-refresh>ตรวจอีกครั้ง</button></div>`;
      return;
    }
    const graded = bank.attempts.filter(a => a.set_no === selectedSet && a.status === 'graded');
    const total = graded.reduce((n, a) => n + a.total_count, 0), correct = graded.reduce((n, a) => n + a.correct_count, 0);
    const availableSubjects = data.subjects.filter(s => bank.counts.some(c => c.set_no === selectedSet && c.subject_id === s.subject_id));
    const percent = total ? 100 * correct / total : 0;
    panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">MY PRACTICE</span><h2>ผลการฝึกของฉัน</h2><p>เห็นพัฒนาการทีละหัวข้อ · คะแนนเปิดเมื่อผู้ดูแลตรวจแล้ว</p></div><div class="practice-toolbar"><label class="practice-set-label">ชุดฝึก <select id="practice-set">${bank.sets.map(s => `<option value="${s.set_no}" ${s.set_no === selectedSet ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label><button type="button" class="secondary" data-practice-refresh ${loading ? 'disabled' : ''}>อัปเดตผล</button>${data.member.can_manage ? '<button type="button" class="secondary" data-review>ตรวจคำตอบนักเรียน</button>' : ''}</div></div>
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
      ${bank.sets.length > 1 ? `<div class="practice-set-history"><h3>ความถูกต้องรวมแต่ละชุด</h3>${bank.sets.map(s => { const a = bank.attempts.filter(x => x.set_no === s.set_no && x.status === 'graded'); return `<span>${esc(s.label)} <b>${pct(a.reduce((n, x) => n + x.correct_count, 0), a.reduce((n, x) => n + x.total_count, 0))}</b> <small>ตรวจแล้ว ${a.length} วิชา</small></span>`; }).join('')}</div>` : ''}`;
    panel.querySelector('.practice-topic-results').addEventListener('toggle', event => { openTopics = event.target.open; });
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      bank = await api('/api/practice?route=summary');
      if (bank.ready && !bank.sets.some(s => s.set_no === selectedSet)) selectedSet = bank.sets[0].set_no;
      renderPanel(); rerender();
    } catch (error) {
      panel.innerHTML = `<div class="practice-heading"><div><h2>ผลการฝึกของฉัน</h2><p role="alert">${esc(error.message)}</p></div><button type="button" class="secondary" data-practice-refresh>ลองอีกครั้ง</button></div>`;
    } finally { loading = false; panel.querySelector('[data-practice-refresh]')?.removeAttribute('disabled'); }
  }

  async function openSubject(sid, topicId, otherAttempt) {
    if (busy) return;
    const ticket = ++requestNo;
    busy = true; viewingOther = Boolean(otherAttempt); session = null; modalError = ''; openGrid = false;
    document.querySelector('#practice-close').disabled = true;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดโจทย์…</p>';
    document.querySelector('#practice-title').textContent = `${subjectName(sid)} · ชุดที่ ${selectedSet}`;
    if (!modal.open) modal.showModal();
    try {
      if (data.member.can_study && !otherAttempt) await post('start', { set_no:selectedSet, subject_id:sid });
      const result = await api(`/api/practice?route=subject&set_no=${selectedSet}&subject_id=${sid}${otherAttempt ? `&attempt_id=${encodeURIComponent(otherAttempt)}` : ''}`);
      if (!modal.open || ticket !== requestNo) return;
      session = result; saved = new Map(result.answers.map(a => [a.question_id, a]));
      choices = new Map(result.answers.map(a => [a.question_id, a.selected_answer]));
      index = topicId ? result.questions.findIndex(q => q.topic_id === topicId) : result.questions.findIndex(q => !saved.has(q.question_id));
      if (index < 0) index = 0;
      await refresh();
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; if (session && modal.open && ticket === requestNo) renderQuestion(); }
  }

  const editable = () => session?.attempt?.status === 'draft' && data.member.can_study && !viewingOther;
  function questionGrid() {
    return `<details class="practice-grid-wrap" ${openGrid ? 'open' : ''}><summary>ไปยังหัวข้อ · เขียวหมายถึงบันทึกคำตอบแล้ว${session.attempt?.status === 'graded' ? ' · สีส้มควรทบทวน' : ''}</summary><div class="practice-question-grid">${session.questions.map((q, i) => {
      const a = saved.get(q.question_id), state = a ? session.attempt?.status === 'graded' && !a.is_correct ? 'incorrect' : 'answered' : '';
      return `<button type="button" class="${state} ${i === index ? 'current' : ''}" data-question-index="${i}" aria-label="ข้อ ${i + 1} ${esc(topicName(q.topic_id))}${a ? ', ตอบแล้ว' : ', ยังไม่ตอบ'}" ${busy ? 'disabled' : ''}>${i + 1}${a ? '<span aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('')}</div></details>`;
  }

  function renderQuestion(focusChoice) {
    if (!session) return;
    const n = session.questions.length, a = session.attempt, status = a?.status;
    document.querySelector('#practice-title').textContent = `${subjectName(session.subject_id)} · ชุดที่ ${session.set_no}${status ? ` · ${stateLabel[status]}` : ' · สำหรับครู'}`;
    document.querySelector('#practice-close').disabled = busy;
    const header = `<div class="practice-dialog-progress"><span>${status === 'graded' ? `ผลตรวจ ${pct(a.correct_count, a.total_count)} · ถูก ${a.correct_count}/${a.total_count}` : `บันทึกแล้ว ${saved.size} / ${n} ข้อ`}</span><progress value="${saved.size}" max="${n}" aria-label="บันทึกแล้ว ${saved.size} จาก ${n} ข้อ"></progress></div>`;
    const error = modalError ? `<p class="practice-inline-error" role="alert">${esc(modalError)}</p>` : '';
    if (index === n) {
      modalBody.innerHTML = `${header}<div class="practice-complete"><span class="eyebrow">SUBJECT SUMMARY</span><h3>${status === 'submitted' ? 'ส่งคำตอบครบแล้ว · รอตรวจ' : status === 'graded' ? 'ตรวจและเปิดผลแล้ว' : saved.size === n ? 'ตอบครบวิชานี้แล้ว' : `ยังเหลือ ${n - saved.size} หัวข้อ`}</h3><p>${status === 'submitted' ? 'เมื่อผู้ดูแลกดตรวจ จะเห็นคะแนนและเปิดเฉลยรายข้อได้' : status === 'graded' ? 'เลือกหัวข้อด้านล่างเพื่อทบทวนวิธีทำและเหตุผล' : 'ส่งคำตอบทั้งวิชาเมื่อทำครบ หลังส่งคำตอบจะถูกล็อกจนผู้ดูแลตรวจและเปิดผล'}</p>${error}${editable() ? saved.size === n ? `<button type="button" class="practice-primary" data-submit ${busy ? 'disabled' : ''}>${busy ? 'กำลังส่ง…' : 'ส่งคำตอบครบทั้งวิชา'}</button>` : '<button type="button" class="practice-primary" data-unanswered>ไปหัวข้อที่ยังไม่ตอบ</button>' : ''}<button type="button" class="secondary" data-question-index="0" ${busy ? 'disabled' : ''}>กลับไปดูข้อแรก</button>${status === 'submitted' && !viewingOther ? '<button type="button" class="secondary" data-update-subject>อัปเดตผลตรวจ</button>' : ''}</div>${questionGrid()}`;
      bindGrid();
      return;
    }
    const q = session.questions[index], answer = saved.get(q.question_id), selected = choices.get(q.question_id);
    const explanation = session.can_review && q.answer_key ? `<section class="practice-explanation"><span class="eyebrow">${status === 'graded' ? 'REVIEW & LEARN' : 'TEACHER NOTES'}</span><h4>เฉลย · ตัวเลือก ${q.answer_key}</h4><p class="practice-correct-answer">${esc(q.choices[q.answer_key - 1])}</p><h4>วิธีทำ / การพิจารณา</h4><p>${esc(q.explanation)}</p><h4>เหตุผลและจุดที่ควรระวัง</h4><p>${esc(q.reasoning)}</p><small>โจทย์แต่งใหม่ตามหัวข้อต้นฉบับ พ.ศ. 2562–2563</small></section>` : '';
    modalBody.innerHTML = `${header}<div class="practice-question-heading"><span>${index + 1} / ${n} · ${esc(q.topic_id)}</span>${answer ? `<span class="practice-badge ${status === 'graded' ? answer.is_correct ? 'correct' : 'incorrect' : 'answered'}">${status === 'graded' ? answer.is_correct ? '✓ ตอบถูก' : 'ควรทบทวน' : '✓ บันทึกแล้ว'}</span>` : ''}<h3>${esc(topicName(q.topic_id))}</h3></div><p class="practice-prompt">${esc(q.prompt)}</p><fieldset class="practice-choices"><legend class="sr-only">เลือกคำตอบหนึ่งตัวเลือก</legend>${q.choices.map((text, i) => `<label class="practice-choice ${selected === i + 1 ? 'selected' : ''} ${session.can_review && q.answer_key === i + 1 ? 'answer-key' : ''}"><input type="radio" name="practice-choice" id="practice-choice-${i + 1}" value="${i + 1}" ${selected === i + 1 ? 'checked' : ''} ${!editable() || busy ? 'disabled' : ''}><span class="practice-choice-number">${i + 1}</span><span>${esc(text)}</span>${session.can_review && q.answer_key === i + 1 ? '<b class="practice-choice-key">เฉลย</b>' : ''}</label>`).join('')}</fieldset><p class="practice-save-status" role="status">${busy ? 'กำลังบันทึกคำตอบ…' : editable() ? 'เลือกคำตอบแล้วระบบบันทึกให้ · กดยืนยันเพื่อไปหัวข้อถัดไป' : status === 'submitted' ? 'ส่งแล้ว · คำตอบถูกล็อกระหว่างรอตรวจ' : status === 'graded' ? `คุณเลือกตัวเลือก ${answer?.selected_answer || '—'} · ดูวิธีทำด้านล่าง` : 'มุมมองครู · ดูโจทย์และเฉลยได้'}</p>${error}<div class="practice-navigation"><button type="button" class="secondary" data-back ${busy || index === 0 ? 'disabled' : ''}>← ย้อน</button>${editable() ? `<button type="button" class="secondary" data-skip ${busy ? 'disabled' : ''}>ข้าม →</button><button type="button" class="practice-primary" data-next ${busy || !selected ? 'disabled' : ''}>${index === n - 1 ? 'ยืนยันคำตอบและสรุปวิชา' : 'ยืนยันคำตอบและไปข้อต่อไป →'}</button>` : `<button type="button" class="practice-primary" data-next ${busy ? 'disabled' : ''}>${index === n - 1 ? 'สรุปวิชา' : 'ข้อถัดไป →'}</button>`}</div>${explanation}${questionGrid()}${viewingOther && status === 'submitted' ? `<div class="practice-grade-action"><p>ตรวจอัตโนมัติตามเฉลยและเปิดผลให้นักเรียนพร้อมกัน</p><button type="button" class="practice-primary" data-grade="${esc(a.attempt_id)}" ${busy ? 'disabled' : ''}>ตรวจและเปิดผล</button></div>` : ''}`;
    if (focusChoice) modalBody.querySelector(`#practice-choice-${focusChoice}`)?.focus();
    else modalBody.querySelector('.practice-question-heading h3')?.setAttribute('tabindex', '-1');
    bindGrid();
  }

  function bindGrid() {
    modalBody.querySelector('.practice-grid-wrap')?.addEventListener('toggle', event => { openGrid = event.target.open; });
  }

  async function saveChoice(question, value) {
    if (!editable() || busy) return false;
    if (saved.get(question.question_id)?.selected_answer === value) return true;
    busy = true; modalError = ''; renderQuestion();
    try {
      await post('save', { attempt_id:session.attempt.attempt_id, question_id:question.question_id, selected_answer:value });
      saved.set(question.question_id, { question_id:question.question_id, selected_answer:value });
      const a = bank.attempts.find(x => x.attempt_id === session.attempt.attempt_id);
      if (a) {
        const old = bank.answers.find(x => x.attempt_id === a.attempt_id && x.question_id === question.question_id);
        if (old) old.selected_answer = value; else bank.answers.push({ attempt_id:a.attempt_id, question_id:question.question_id, selected_answer:value });
      }
      renderPanel(); rerender();
      return true;
    } catch (error) { modalError = `${error.message} · กรุณากดยืนยันคำตอบเพื่อลองบันทึกอีกครั้ง`; return false; }
    finally { busy = false; if (modal.open) renderQuestion(value); }
  }

  async function move(to) {
    if (busy || !session) return;
    if (editable() && index < session.questions.length) {
      const q = session.questions[index], value = choices.get(q.question_id);
      if (value && !await saveChoice(q, value)) return;
    }
    index = Math.max(0, Math.min(to, session.questions.length)); modalError = ''; renderQuestion();
    modalBody.querySelector('.practice-question-heading h3')?.focus(); modal.scrollTop = 0;
  }

  async function closeModal() {
    if (busy) return;
    if (session && editable()) {
      const q = session.questions[index], value = q && choices.get(q.question_id);
      if (value && !await saveChoice(q, value)) return;
    }
    requestNo++; modal.close(); session = null;
  }

  async function updateSubject() {
    if (!session || busy) return;
    busy = true; const previousIndex = index;
    try {
      session = await api(`/api/practice?route=subject&set_no=${session.set_no}&subject_id=${session.subject_id}${viewingOther ? `&attempt_id=${session.attempt.attempt_id}` : ''}`);
      saved = new Map(session.answers.map(a => [a.question_id, a])); choices = new Map(session.answers.map(a => [a.question_id, a.selected_answer]));
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
        session = await api(`/api/practice?route=subject&set_no=${session.set_no}&subject_id=${session.subject_id}`);
        saved = new Map(session.answers.map(a => [a.question_id, a]));
      }
      notice(session.attempt.status === 'graded' ? 'ผู้ดูแลตรวจและเปิดผลแล้ว' : 'ส่งคำตอบครบทั้งวิชาแล้ว · รอผู้ดูแลตรวจ');
      await refresh();
    }
    catch (error) { modalError = error.message; }
    finally { busy = false; renderQuestion(); }
  }

  async function openReview() {
    if (busy || !data.member.can_manage) return;
    requestNo++; busy = true; session = null;
    document.querySelector('#practice-title').textContent = 'คำตอบนักเรียน · รอตรวจ';
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดรายการ…</p>'; if (!modal.open) modal.showModal();
    try {
      const result = await api('/api/practice?route=review');
      modalBody.innerHTML = `<p class="practice-muted">กดตรวจเพื่อให้ระบบเทียบเฉลย คำนวณคะแนน และเปิดผลให้นักเรียน</p>${result.attempts.length ? result.attempts.map(a => `<article class="practice-review-row"><div><strong>${esc(a.member_name)}</strong><span>${esc(subjectName(a.subject_id))} · ชุดที่ ${a.set_no} · ${a.total_count} ข้อ</span><small>ส่ง ${esc(new Date(a.submitted_at).toLocaleString('th-TH'))}</small></div><div><button type="button" class="secondary" data-review-open="${a.attempt_id}" data-review-set="${a.set_no}" data-review-subject="${a.subject_id}">ดูคำตอบ</button><button type="button" class="practice-primary" data-grade="${a.attempt_id}">ตรวจและเปิดผล</button></div></article>`).join('') : '<div class="empty">ไม่มีคำตอบรอตรวจในขณะนี้</div>'}`;
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; }
  }

  async function grade(id, button) {
    if (busy || !data.member.can_manage) return;
    busy = true; button.disabled = true; button.textContent = 'กำลังตรวจ…';
    try {
      await post('grade', { attempt_id:id }); notice('ตรวจและเปิดคะแนนกับเฉลยให้นักเรียนแล้ว');
      busy = false;
      if (session) await updateSubject(); else await openReview();
      await refresh();
    } catch (error) { busy = false; notice(error.message); button.disabled = false; button.textContent = 'ตรวจและเปิดผล'; }
  }

  const mainClick = event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.practice) {
      const topic = data.topics.find(t => t.topic_id === target.dataset.practice); if (topic) openSubject(topic.subject_id, topic.topic_id);
    } else if (target.dataset.practiceSubject) openSubject(target.dataset.practiceSubject);
    else if (target.hasAttribute('data-practice-refresh')) refresh();
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
    else if (t.dataset.reviewOpen) { selectedSet = Number(t.dataset.reviewSet); openSubject(t.dataset.reviewSubject, null, t.dataset.reviewOpen); }
    else if (t.dataset.grade) grade(t.dataset.grade, t);
  };
  const choiceChange = event => {
    if (event.target.name !== 'practice-choice' || !editable() || busy) return;
    const q = session.questions[index], value = Number(event.target.value); choices.set(q.question_id, value); saveChoice(q, value);
  };
  const cancel = event => { event.preventDefault(); closeModal(); };
  main.addEventListener('click', mainClick); main.addEventListener('change', setChange);
  modalBody.addEventListener('click', modalClick); modalBody.addEventListener('change', choiceChange);
  modal.addEventListener('cancel', cancel); document.querySelector('#practice-close').addEventListener('click', closeModal);
  renderPanel();
  return { refresh, topicAction, subjectChanged() { resultSubject = getSubject(); if (bank?.ready) renderPanel(); }, destroy() {
    requestNo++; main.removeEventListener('click', mainClick); main.removeEventListener('change', setChange);
    modalBody.removeEventListener('click', modalClick); modalBody.removeEventListener('change', choiceChange);
    modal.removeEventListener('cancel', cancel); document.querySelector('#practice-close').removeEventListener('click', closeModal);
    modal.close(); session = null;
  } };
}
