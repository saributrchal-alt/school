const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pct = (correct, total) => total ? `${Number((100 * correct / total).toFixed(1)).toLocaleString('th-TH')}%` : '—';
const QUESTION_IMAGE_REV = '20261006-crop3';
const freshQuestionImage = url => url ? `${url}${url.includes("?") ? "&" : "?"}v=${QUESTION_IMAGE_REV}` : '';

const stateLabel = { draft:'กำลังทำ', submitted:'รอตรวจ', graded:'ตรวจแล้ว' };
const setLabel = set => set?.source_type === 'original_exam' ? `ชุด ${Number(set.set_no)} · ข้อสอบจริง` : Number.isInteger(Number(set?.set_no)) ? `ชุด ${Number(set.set_no)}` : (set?.display_label || set?.label || '');
const setText = (sets, no) => setLabel((sets || []).find(s => s.set_no === no));

export const learningLabels = { not_started:'ยังไม่เริ่ม', in_progress:'กำลังเรียน', review:'ทบทวน', completed:'เรียนแล้ว' };
export function learningBadge(status, ready = true, pending = 'เลือกนักเรียน') {
  const state = learningLabels[status] ? status : 'not_started';
  return `<span class="learning-badge ${ready ? state : 'unavailable'}"><span class="learning-circle" aria-hidden="true">${ready && state === 'completed' ? '✓' : ready ? '●' : '…'}</span>${esc(ready ? learningLabels[state] : pending)}</span>`;
}
export function learningSteps(status, { compact = false, ready = true } = {}) {
  const current = ready ? Math.max(0, Object.keys(learningLabels).indexOf(status)) : -1;
  const tag = compact ? 'span' : 'ol', stepTag = compact ? 'span' : 'li';
  return `<${tag} class="learning-steps learning-road${compact ? ' compact' : ''}"${compact ? ' role="list"' : ''} data-learning-current="${esc(ready ? status : '')}" aria-label="เส้นทางการเรียนทั้ง 4 ขั้น">${Object.entries(learningLabels).map(([key, label], i) => {
    const done = ready && (i < current || status === 'completed');
    return `<${stepTag} class="learning-step ${done ? 'done' : ''} ${i === current ? 'current' : ''}" data-learning-step="${key}"${compact ? ' role="listitem"' : ''}${i === current ? ' aria-current="step"' : ''}><span class="learning-step-circle" aria-hidden="true">${done ? '✓' : i + 1}</span><span class="learning-step-label">${label}</span></${stepTag}>`;
  }).join('')}</${tag}>`;
}
export function topicLearningBadge(data, topicId) {
  const item = (data.viewedProgress || data.progress || []).find(p => p.topic_id === topicId);
  return learningBadge(item?.status || 'not_started', Boolean(data.viewedStudent || data.member.can_study) && !data.learning_error, data.learning_error ? 'เปิดสถานะไม่สำเร็จ' : 'เลือกนักเรียน');
}
export function topicLearningRoad(data, topicId) {
  const item = (data.viewedProgress || data.progress || []).find(p => p.topic_id === topicId);
  const ready = Boolean(data.viewedStudent || data.member.can_study) && !data.learning_error;
  return learningSteps(item?.status || 'not_started', { compact:true, ready }) + (ready ? '' : `<small class="learning-road-note">${esc(data.learning_error ? 'เปิดสถานะไม่สำเร็จ' : 'เลือกนักเรียนเพื่อดูสถานะ')}</small>`);
}
export async function recordLearningProgress(data, api, path, topicId, status) {
  const result = await api(`${path}?route=progress`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topic_id:topicId,status}) });
  const item = result.item;
  if (!item || item.topic_id !== topicId || !learningLabels[item.status]) throw new Error('บันทึกสถานะการเรียนไม่สำเร็จ');
  data.progress ||= [];
  const previous = data.progress.find(p => p.topic_id === topicId);
  if (previous) Object.assign(previous, item); else data.progress.push(item);
  data.learning_error = '';
  if (data.viewedStudent?.member_id === data.member.member_id) data.viewedProgress = data.progress;
  return item;
}

export function createPractice({ main, data, api, notice, rerender, getSubject, apiPath = '/api/practice' }) {
  const panel = document.querySelector('#practice-dashboard');
  const modal = document.querySelector('#practice-dialog');
  const modalBody = document.querySelector('#practice-body');
  let bank = null, selectedSet = 1, resultSubject = getSubject(), session = null, index = 0;
  let busy = false, viewingOther = false, loading = false, requestNo = 0, openTopics = false, openGrid = false;
  let choices = new Map(), saved = new Map(), modalError = '';
  let staffResults = null, staffStudentId = null, resultsQuery = '', resultsFilter = 'all', returnView = null;
  let staffPracticeResults = null, staffExamResults = null, resultsMode = null, resultsSessionId = '', examReportReturn = null;
  let examSessionsData = null, examEditingId = null, examMembersData = null;
  let realExam = null, realExamIndex = 0, realExamSaved = new Map(), realExamChoices = new Map();
  let realExamTimer = null, realExamClockOffset = 0, realExamSubmitting = false;
  const realExamWarnings = new Set();
  let understandingData = null, understandingFilter = 'needs_help', understandingQuery = '', understandingReturn = false;
  let understandingSaving = false;
  let learningRoster = null, learningReport = null, learningQuery = '', learningFilter = 'all', learningSubject = 'all';
  let learningView = false, learningSaving = false, learningRequest = 0, learningTimer = null;
  let disposed = false, learningReportRequest = 0;
  const isALevel = apiPath === '/api/alevel';
  const learningPath = isALevel ? '/api/alevel' : '/api/school';
  const examTrack = isALevel ? 'A-Level' : 'เตรียมทหาร';
  const subjectName = id => id === 'ALL' ? 'ข้อสอบทั้งชุด · ทุกวิชา' : (data.subjects.find(s => s.subject_id === id)?.subject_name_th || id);
  const topicName = id => data.topics.find(t => t.topic_id === id)?.topic_name_th || id;
  const canSeeResults = () => data.member.can_teach || data.member.can_manage;
  const date = value => value ? new Date(value).toLocaleString('th-TH') : '—';
  const resultButton = () => canSeeResults() ? '<button type="button" class="secondary" data-student-results>ผลตรวจรายคน</button>' : '';
  const examManageButton = () => canSeeResults() ? '<button type="button" class="secondary" data-exam-manage>จัดการสอบจริง</button>' : '';
  const understandingButton = () => '<button type="button" class="secondary" data-understanding-list>' + (canSeeResults() ? 'ติดตามความเข้าใจ' : 'ทบทวนข้อที่ยังไม่เข้าใจ') + '</button>';
  const learningButton = () => '<button type="button" class="secondary" data-learning-report>สถานะหัวข้อเรียน</button>';
  const post = (route, value) => api(`${apiPath}?route=${route}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) });

  function renderLearningPicker() {
    const picker = main.querySelector('#learning-member-picker');
    if (!picker || !canSeeResults()) return;
    picker.innerHTML = `<label class="learning-member-label">แสดงสถานะการเรียนของ <select id="learning-member" aria-label="เลือกนักเรียนเพื่อแสดงสถานะรายหัวข้อ"><option value="">${data.member.can_study ? 'การเรียนของฉัน' : 'เลือกนักเรียน…'}</option>${(learningRoster?.students || []).map(s => `<option value="${esc(s.member_id)}" ${s.member_id === data.viewedStudent?.member_id ? 'selected' : ''}>${esc(s.member_name)} · ${esc(s.member_id)}${s.is_active && s.can_study ? '' : ' · ถอนสิทธิ์แล้ว'}</option>`).join('')}</select></label>${data.learning_error ? `<span role="alert">${esc(data.learning_error)}</span>` : ''}<button type="button" class="secondary" data-learning-refresh>อัปเดตสถานะ</button>`;
  }

  async function refreshLearning() {
    if (disposed || !data.topics.length) return;
    const ticket = ++learningRequest;
    try {
      if (canSeeResults() && !learningRoster) learningRoster = await api(learningPath + '?route=learning-results');
      if (disposed || ticket !== learningRequest) return;
      const id = data.viewedStudent?.member_id;
      if (id || data.member.can_study) {
        const result = await api(`${learningPath}?route=progress${id ? '&member_id=' + encodeURIComponent(id) : ''}`);
        if (disposed || ticket !== learningRequest) return;
        if (id) { data.viewedStudent = result.student; data.viewedProgress = result.progress; }
        else data.progress = result.progress;
      }
      data.learning_error = '';
    } catch (error) { if (disposed || ticket !== learningRequest) return; data.learning_error = error.message; }
    renderLearningPicker();
  }

  async function selectLearningMember(id) {
    if (disposed) return;
    const ticket = ++learningRequest;
    const select = main.querySelector('#learning-member');
    if (select) select.disabled = true;
    try {
      if (!id) { data.viewedStudent = null; data.viewedProgress = null; }
      else {
        const result = await api(`${learningPath}?route=progress&member_id=${encodeURIComponent(id)}`);
        if (ticket !== learningRequest) return;
        data.viewedStudent = result.student; data.viewedProgress = result.progress;
      }
      data.learning_error = '';
    } catch (error) { data.learning_error = error.message; notice(error.message); }
    if (ticket === learningRequest) { renderLearningPicker(); rerender(); renderPanel(); }
  }

  async function attachLearning(paper, other = false) {
    if (!paper.questions?.some(q => data.topics.some(t => t.topic_id === q.topic_id))) return;
    const id = paper.student?.member_id || (other ? null : !data.member.can_study ? data.viewedStudent?.member_id : data.member.member_id);
    if (!id) return;
    try {
      const result = await api(`${learningPath}?route=progress&member_id=${encodeURIComponent(id)}`);
      paper.learning = result;
      paper.learning_error = '';
      if (id === data.member.member_id) data.progress = result.progress;
    } catch (error) { paper.learning_error = error.message; }
  }

  function learningMarkup(paper, q, mode) {
    if (!q || !data.topics.some(t => t.topic_id === q.topic_id)) return '';
    const item = paper.learning?.progress.find(p => p.topic_id === q.topic_id);
    const ready = Boolean(paper.learning) && !paper.learning_error;
    const status = item?.status || 'not_started';
    const canEdit = ready && paper.learning.can_edit;
    return `<section class="learning-card" aria-label="สถานะการเรียนหัวข้อนี้"><div class="learning-card-heading"><span>${paper.learning ? esc(paper.learning.student.member_name) + ' · ' : ''}สถานะหัวข้อนี้</span>${learningBadge(status, ready, paper.learning_error ? 'เปิดสถานะไม่สำเร็จ' : 'เลือกนักเรียน')}</div>${ready ? learningSteps(status) : ''}${canEdit ? `<label class="learning-control">บันทึกสถานะ <select data-learning-status="${esc(q.topic_id)}" aria-label="สถานะการเรียน ${esc(topicName(q.topic_id))}" ${learningSaving ? 'disabled' : ''}>${Object.entries(learningLabels).map(([key, label]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : !paper.learning && !paper.learning_error ? '<button type="button" class="secondary" data-learning-report>เลือกนักเรียนเพื่อดูสถานะ</button>' : ''}${item?.updated_at ? `<small>บันทึกล่าสุด ${esc(date(item.updated_at))}</small>` : ready ? '<small>ยังไม่มีการบันทึกสถานะหัวข้อนี้</small>' : ''}${paper.learning_error ? `<p role="alert">${esc(paper.learning_error)}</p><button type="button" class="secondary" data-learning-retry="${mode}">ลองเปิดสถานะอีกครั้ง</button>` : ''}</section>`;
  }

  function updateLearningHeading(paper, q, mode) {
    const title = document.querySelector('#practice-title');
    const old = modalBody.querySelector('.learning-card');
    if (old) old.outerHTML = learningMarkup(paper, q, mode);
    if (!q || !data.topics.some(t => t.topic_id === q.topic_id)) return;
    const label = title.querySelector('.learning-paper-title')?.textContent || title.textContent;
    const item = paper.learning?.progress.find(p => p.topic_id === q.topic_id);
    title.innerHTML = `<span class="learning-paper-title">${esc(label)}</span><span class="learning-sticky-topic"><span>${esc(q.topic_id)} · ${esc(topicName(q.topic_id))}</span>${learningSteps(item?.status || 'not_started', { compact:true, ready:Boolean(paper.learning) && !paper.learning_error })}</span>`;
  }

  async function changeLearning(topicId, status) {
    if (learningSaving || !data.member.can_study) return;
    learningSaving = true;
    learningRequest++; learningReportRequest++;
    modalBody.querySelectorAll('[data-learning-status]').forEach(el => { el.disabled = true; });
    try {
      await recordLearningProgress(data, api, learningPath, topicId, status);
      for (const paper of [session, realExam]) if (paper?.learning?.can_edit) paper.learning.progress = data.progress;
      if (learningReport?.can_edit) learningReport.progress = data.progress;
      if (data.viewedStudent?.member_id === data.member.member_id) data.viewedProgress = data.progress;
      notice('บันทึกสถานะหัวข้อแล้ว');
    } catch (error) { notice(error.message); }
    finally {
      learningSaving = false;
      if (disposed) return;
      rerender(); renderPanel();
      if (learningView && learningReport) renderLearningRows();
      else if (realExam) updateLearningHeading(realExam, realExam.questions[realExamIndex], 'exam');
      else if (session) updateLearningHeading(session, session.questions[index], 'practice');
    }
  }

  function renderLearningRosterRows() {
    const root = modalBody.querySelector('#learning-roster');
    if (!root) return;
    const query = learningQuery.trim().toLocaleLowerCase('th');
    const students = (learningRoster?.students || []).filter(s => !query || `${s.member_name} ${s.member_id}`.toLocaleLowerCase('th').includes(query));
    root.innerHTML = students.length ? students.map(s => `<article class="learning-student-row"><div><strong>${esc(s.member_name)}</strong><small>รหัสสมาชิก ${esc(s.member_id)}${s.is_active && s.can_study ? '' : ' · ถอนสิทธิ์แล้ว · เก็บประวัติการเรียน'}</small></div><button type="button" class="secondary" data-learning-student="${esc(s.member_id)}">ดูสถานะรายหัวข้อ ↗</button></article>`).join('') : '<p class="practice-muted">ไม่พบนักเรียน</p>';
  }

  function renderLearningRows() {
    const root = modalBody.querySelector('#learning-rows');
    if (!root || !learningReport) return;
    const progress = new Map(learningReport.progress.map(p => [p.topic_id, p]));
    const query = learningQuery.trim().toLocaleLowerCase('th');
    const topics = data.topics.filter(t => (learningSubject === 'all' || t.subject_id === learningSubject) && (learningFilter === 'all' || (progress.get(t.topic_id)?.status || 'not_started') === learningFilter) && (!query || `${t.topic_id} ${t.topic_name_th} ${subjectName(t.subject_id)}`.toLocaleLowerCase('th').includes(query)));
    modalBody.querySelector('#learning-count').textContent = `พบ ${topics.length} / ${data.topics.length} หัวข้อ`;
    root.innerHTML = topics.length ? topics.map(t => {
      const item = progress.get(t.topic_id), status = item?.status || 'not_started';
      return `<article class="learning-topic-row"><div class="topic-head"><span class="topic-code">${esc(t.topic_id)}</span><strong class="topic-name">${esc(t.topic_name_th)}</strong>${learningBadge(status)}</div><small>${esc(subjectName(t.subject_id))}</small>${learningSteps(status)}${learningReport.can_edit ? `<label class="learning-control">บันทึกสถานะ <select data-learning-status="${esc(t.topic_id)}" aria-label="สถานะ ${esc(t.topic_name_th)}" ${learningSaving ? 'disabled' : ''}>${Object.entries(learningLabels).map(([key, label]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}<small>${item?.updated_at ? 'บันทึกล่าสุด ' + esc(date(item.updated_at)) : 'ยังไม่มีการบันทึกสถานะหัวข้อนี้'}</small></article>`;
    }).join('') : '<p class="practice-muted">ไม่พบหัวข้อที่ตรงกับตัวกรอง</p>';
    const counts = Object.keys(learningLabels).map(key => [key, data.topics.filter(t => (progress.get(t.topic_id)?.status || 'not_started') === key).length]);
    modalBody.querySelector('#learning-summary').innerHTML = counts.map(([key, n]) => `<span>${learningBadge(key)} <b>${n}</b> หัวข้อ</span>`).join('');
  }

  async function openLearningReport(id) {
    if (busy || learningSaving || realExamSubmitting) return;
    const ticket = ++requestNo;
    busy = true; learningView = true; learningReport = null; session = null; realExam = null;
    understandingReturn = false; clearInterval(realExamTimer); realExamTimer = null;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดสถานะการเรียน…</p>';
    document.querySelector('#practice-title').textContent = 'สถานะหัวข้อเรียน · ' + examTrack;
    if (!modal.open) modal.showModal();
    try {
      if (canSeeResults() && !id) {
        learningRoster = await api(learningPath + '?route=learning-results');
        if (!modal.open || ticket !== requestNo) return;
        learningQuery = '';
        modalBody.innerHTML = '<p class="practice-muted">เลือกนักเรียนเพื่อดูสถานะล่าสุดประจำหัวข้อ · นักเรียนเป็นผู้บันทึกสถานะของตนเอง</p><input type="search" id="learning-roster-search" class="learning-search" aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อนักเรียนหรือรหัสสมาชิก…"><div id="learning-roster"></div>';
        renderLearningRosterRows();
      } else {
        const result = await api(`${learningPath}?route=progress${id ? '&member_id=' + encodeURIComponent(id) : ''}`);
        if (!modal.open || ticket !== requestNo) return;
        learningReport = result; learningQuery = ''; learningFilter = 'all'; learningSubject = 'all';
        document.querySelector('#practice-title').textContent = result.student.member_name + ' · สถานะหัวข้อเรียน';
        modalBody.innerHTML = `${canSeeResults() ? '<button type="button" class="secondary" data-learning-report>← รายชื่อนักเรียน</button>' : ''}<div class="learning-report-head"><div><h3>${esc(result.student.member_name)}</h3><small>รหัสสมาชิก ${esc(result.student.member_id)}${result.student.is_active && result.student.can_study ? '' : ' · ถอนสิทธิ์แล้ว'}</small></div><button type="button" class="secondary" data-learning-update>อัปเดตสถานะ</button></div><p class="practice-muted">สถานะการเรียนล่าสุดของแต่ละหัวข้อ · นักเรียนบันทึกด้วยตนเอง</p><div id="learning-summary" class="learning-summary"></div><div class="learning-filters"><input type="search" id="learning-topic-search" aria-label="ค้นหาหัวข้อ" placeholder="ค้นหาชื่อหรือรหัสหัวข้อ…"><select id="learning-subject-filter" aria-label="กรองวิชา"><option value="all">ทุกวิชา</option>${data.subjects.map(s => `<option value="${esc(s.subject_id)}">${esc(s.subject_name_th)}</option>`).join('')}</select><select id="learning-status-filter" aria-label="กรองสถานะการเรียน"><option value="all">ทุกสถานะ</option>${Object.entries(learningLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></div><p id="learning-count" class="practice-muted" role="status" aria-live="polite"></p><div id="learning-rows"></div><p id="learning-refresh-note" class="practice-muted" role="status">อัปเดตอัตโนมัติขณะเปิดหน้านี้</p>`;
        renderLearningRows();
      }
      modal.scrollTop = 0;
    } catch (error) { if (ticket === requestNo) modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-learning-report>ลองอีกครั้ง</button>`; }
    finally { busy = false; }
  }

  async function updateLearningReport() {
    if (!learningView || !learningReport || !modal.open || busy || learningSaving) return;
    const id = learningReport.student.member_id, ticket = requestNo, update = ++learningReportRequest;
    try {
      const result = await api(`${learningPath}?route=progress&member_id=${encodeURIComponent(id)}`);
      if (disposed || update !== learningReportRequest || learningSaving || !learningView || !modal.open || ticket !== requestNo || learningReport?.student.member_id !== id) return;
      learningReport = result; renderLearningRows();
      modalBody.querySelector('#learning-refresh-note').textContent = 'อัปเดตล่าสุด ' + date(new Date().toISOString());
    } catch (error) { const note = modalBody.querySelector('#learning-refresh-note'); if (!disposed && update === learningReportRequest && ticket === requestNo && note) note.textContent = 'อัปเดตสถานะไม่สำเร็จ · ' + error.message; }
  }

  async function attachUnderstanding(paper, mode) {
    const id = mode === 'exam' ? paper.attempt?.exam_attempt_id : paper.attempt?.attempt_id;
    if (!paper.can_review || !id || paper.attempt.status !== (mode === 'exam' ? 'submitted' : 'graded')) return;
    try {
      const result = await api(`${apiPath}?route=understanding&mode=${mode}&attempt_id=${encodeURIComponent(id)}`);
      paper.understanding = result.items;
      paper.understanding_ready = result.ready;
      paper.understanding_error = result.ready ? '' : 'กำลังเตรียมระบบบันทึกความเข้าใจ';
    } catch (error) {
      paper.understanding_ready = false;
      paper.understanding_error = error.message;
    }
  }

  function understandingMarkup(paper, q, mode, readOnly) {
    const id = mode === 'exam' ? paper.attempt?.exam_attempt_id : paper.attempt?.attempt_id;
    const back = understandingReturn ? '<button type="button" class="secondary understanding-back" data-understanding-list>← กลับรายการความเข้าใจ</button>' : '';
    if (!paper.can_review || !id || q.answer_key == null || paper.attempt.status !== (mode === 'exam' ? 'submitted' : 'graded')) return back;
    const item = paper.understanding?.find(x => x.question_id === q.question_id);
    const ready = paper.understanding_ready !== false;
    const heading = readOnly ? 'ความเข้าใจที่นักเรียนแจ้งหลังดูเฉลย' : 'หลังดูเฉลยแล้ว ข้อนี้เข้าใจหรือยัง?';
    const status = item?.status === 'understood' ? '✓ เข้าใจแล้ว' : item?.status === 'needs_help' ? '⚑ ยังไม่เข้าใจ' : 'ยังไม่ได้ระบุความเข้าใจ';
    return `${back}<section class="understanding-card ${item?.status || ''}" aria-label="ความเข้าใจหลังดูเฉลย"><h4>${heading}</h4>${readOnly
      ? `<p class="understanding-badge ${item?.status || ''}">${ready ? status : esc(paper.understanding_error)}</p>`
      : `<p>แจ้งให้ครูรู้เพื่อช่วยทบทวนให้ · เปลี่ยนสถานะได้หลังเข้าใจแล้ว</p><div class="understanding-actions">${[['understood','✓ เข้าใจแล้ว'],['needs_help','⚑ ยังไม่เข้าใจ']].map(([value,label]) => `<button type="button" class="understanding-choice ${value} ${item?.status === value ? 'selected' : ''}" data-understanding-status="${value}" data-understanding-mode="${mode}" aria-pressed="${item?.status === value}" ${!ready || understandingSaving ? 'disabled' : ''}>${label}</button>`).join('')}</div>`}
      <small role="status" aria-live="polite">${understandingSaving ? 'กำลังบันทึกความเข้าใจ…' : paper.understanding_error ? esc(paper.understanding_error) : item ? `บันทึก ${esc(date(item.updated_at))}` : readOnly ? 'นักเรียนยังไม่ได้ปักธงข้อนี้' : 'ยังไม่ได้เลือก · สถานะนี้แยกจากคะแนนสอบ'}</small>
      ${!ready ? `<button type="button" class="secondary" data-understanding-reload="${mode}">ลองโหลดสถานะอีกครั้ง</button>` : ''}</section>`;
  }

  async function saveUnderstandingStatus(status, mode) {
    const paper = mode === 'exam' ? realExam : session;
    const q = mode === 'exam' ? paper?.questions[realExamIndex] : paper?.questions[index];
    if (busy || !q || !data.member.can_study || (mode === 'exam' ? paper.staff_review : viewingOther)) return;
    const id = mode === 'exam' ? paper.attempt.exam_attempt_id : paper.attempt.attempt_id;
    busy = true; understandingSaving = true; paper.understanding_error = '';
    const render = mode === 'exam' ? renderRealExam : renderQuestion;
    render(); document.querySelector('#practice-close').disabled = true;
    try {
      const result = await post('understanding-save', { mode, attempt_id:id, question_id:q.question_id, status });
      paper.understanding = (paper.understanding || []).filter(x => x.question_id !== q.question_id).concat(result.item);
      notice(status === 'understood' ? 'บันทึกว่าเข้าใจแล้ว' : 'แจ้งครูแล้วว่าข้อนี้ยังไม่เข้าใจ');
    } catch (error) { paper.understanding_error = error.message; }
    finally { busy = false; understandingSaving = false; document.querySelector('#practice-close').disabled = false; if (modal.open) render(); }
  }

  async function reloadUnderstanding(mode) {
    if (busy) return;
    const paper = mode === 'exam' ? realExam : session;
    if (!paper) return;
    busy = true;
    try { await attachUnderstanding(paper, mode); }
    finally { busy = false; if (modal.open) (mode === 'exam' ? renderRealExam : renderQuestion)(); }
  }

  function renderUnderstandingRows() {
    const list = modalBody.querySelector('#understanding-list');
    if (!list || !understandingData) return;
    const query = understandingQuery.trim().toLocaleLowerCase('th');
    const rows = understandingData.items.filter(x => (understandingFilter === 'all' || x.status === understandingFilter)
      && (!query || `${x.member_name} ${x.member_id} ${subjectName(x.subject_id)} ${topicName(x.topic_id)} ${x.question_no || ''} ${x.session_title || ''}`.toLocaleLowerCase('th').includes(query)));
    modalBody.querySelector('#understanding-count').textContent = `พบ ${rows.length} รายการ`;
    list.innerHTML = rows.length ? rows.map(x => {
      const position = understandingData.items.indexOf(x);
      return `<article class="understanding-row"><div>${understandingData.can_review ? `<strong>${esc(x.member_name)}</strong><small>รหัสสมาชิก ${esc(x.member_id)}</small>` : ''}<span class="understanding-badge ${x.status}">${x.status === 'needs_help' ? '⚑ ยังไม่เข้าใจ' : '✓ เข้าใจแล้ว'}</span><p>${esc(subjectName(x.subject_id))} · ${esc(x.mode === 'exam' ? `สอบจริง · ${x.session_title || 'รอบสอบ'}` : setText(bank?.sets, x.set_no) || `ชุดฝึก ${x.set_no}`)} · ${x.question_no ? `ข้อ ${esc(x.question_no)}` : esc(x.topic_id)}</p><small>${esc(topicName(x.topic_id))} · บันทึก ${esc(date(x.updated_at))}</small></div><button type="button" class="secondary" data-understanding-open="${position}">เปิดโจทย์และเฉลย ↗</button></article>`;
    }).join('') : '<div class="empty">ไม่มีข้อที่ตรงกับสถานะหรือคำค้นนี้ · ข้อที่ยังไม่ได้ปักธงจะไม่แสดงในรายการ</div>';
  }

  function renderUnderstandingList() {
    document.querySelector('#practice-title').textContent = understandingData.can_review ? 'ติดตามความเข้าใจของนักเรียน' : 'ทบทวนความเข้าใจของฉัน';
    const help = understandingData.items.filter(x => x.status === 'needs_help').length;
    modalBody.innerHTML = `<p class="practice-muted">${understandingData.can_review ? 'นักเรียนแจ้งสถานะหลังดูเฉลยแล้ว · เปิดข้อที่ยังไม่เข้าใจเพื่อช่วยทบทวน' : 'รวมข้อที่ปักธงหลังดูเฉลย · ทบทวนแล้วเปลี่ยนเป็นเข้าใจได้'} · ${esc(examTrack)}</p><div class="practice-report-stats understanding-stats"><span><b>${help}</b> ยังไม่เข้าใจ</span><span><b>${understandingData.items.length - help}</b> เข้าใจแล้ว</span></div><div class="practice-report-toolbar"><button type="button" class="secondary" data-understanding-list>อัปเดตรายการ</button></div>${understandingData.ready ? `<div class="practice-report-filters"><input type="search" id="understanding-search" aria-label="ค้นหารายการความเข้าใจ" placeholder="ค้นหาชื่อ วิชา หรือข้อที่ต้องทบทวน…" value="${esc(understandingQuery)}"><select id="understanding-filter" aria-label="กรองความเข้าใจ">${[['needs_help','ยังไม่เข้าใจ'],['understood','เข้าใจแล้ว'],['all','ทุกสถานะ']].map(([value,label]) => `<option value="${value}" ${value === understandingFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p id="understanding-count" class="practice-muted" role="status" aria-live="polite"></p><div id="understanding-list"></div>` : '<div class="empty">กำลังเตรียมระบบบันทึกความเข้าใจ</div>'}`;
    renderUnderstandingRows(); modal.scrollTop = 0;
  }

  async function openUnderstandingList() {
    learningView = false;
    if (busy) return;
    const ticket = ++requestNo; busy = true; session = null; realExam = null; understandingReturn = false; returnView = null; examReportReturn = null;
    clearInterval(realExamTimer); realExamTimer = null;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดรายการความเข้าใจ…</p>';
    document.querySelector('#practice-title').textContent = 'ติดตามความเข้าใจ';
    if (!modal.open) modal.showModal();
    document.querySelector('#practice-close').disabled = true;
    try {
      const result = await api(`${apiPath}?route=understanding&scope=${canSeeResults() ? 'all' : 'mine'}`);
      if (modal.open && ticket === requestNo) { understandingData = result; renderUnderstandingList(); }
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-understanding-list>ลองอีกครั้ง</button>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; }
  }

  async function openUnderstandingQuestion(position) {
    const item = understandingData?.items[position];
    if (!item || busy) return;
    understandingReturn = true;
    if (item.mode === 'practice') {
      realExam = null;
      await openSubject(item.subject_id, item.topic_id, understandingData.can_review ? item.attempt_id : null, item.set_no);
      if (session) { const i = session.questions.findIndex(q => q.question_id === item.question_id); if (i >= 0) index = i; renderQuestion(); }
      return;
    }
    busy = true; session = null; document.querySelector('#practice-close').disabled = true;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดข้อสอบที่ปักธง…</p>';
    try {
      const result = await api(`${apiPath}?route=${understandingData.can_review ? `exam-review&exam_attempt_id=${encodeURIComponent(item.attempt_id)}` : `exam-open&session_id=${encodeURIComponent(item.session_id)}&review_attempt_id=${encodeURIComponent(item.attempt_id)}`}`);
      await loadRealExam(result);
      realExamIndex = realExam.questions.findIndex(q => q.question_id === item.question_id);
      if (realExamIndex < 0) realExamIndex = -1;
      renderRealExam(); modal.scrollTop = 0;
    } catch (error) { modalBody.innerHTML = `<p class="practice-inline-error" role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-understanding-list>กลับรายการความเข้าใจ</button>`; }
    finally { busy = false; document.querySelector('#practice-close').disabled = false; }
  }
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


  function studentExamSection() {
    if (!data.member.can_study || !examSessionsData) return '';
    const sessions=(examSessionsData.sessions||[]).filter(s=>s.is_published && (!isALevel || s.subject_id===getSubject()));
    if(!sessions.length) return examSessionsData.exam_error
      ? '<section class="real-exam-section"><div class="real-exam-section-head"><div><span class="eyebrow">REAL EXAM</span><h3>สอบจริง</h3></div></div><p class="practice-muted">'+esc(examSessionsData.exam_error)+'</p></section>'
      : '';

    const attempts=examSessionsData.attempts||[];
    const now=Date.now();
    const cards=sessions.map(s=>{
      const own=attempts.filter(a=>a.session_id===s.session_id).sort((a,b)=>Number(b.attempt_no)-Number(a.attempt_no));
      const a=own[0];
      const opens=s.opens_at?new Date(s.opens_at).getTime():null;
      const closes=s.closes_at?new Date(s.closes_at).getTime():null;
      const fixed=s.start_policy==='fixed'&&s.fixed_start_at?new Date(s.fixed_start_at).getTime():null;
      let label='เริ่มสอบ', disabled=false, status='พร้อมสอบ', tone='';
      if(a?.status==='draft'){
        label='ทำข้อสอบต่อ';
        status='กำลังสอบ · หมดเวลา '+date(a.deadline_at);
        tone=' active';
      }else if(a?.status==='submitted'){
        label=a.result_visible?'ดูผลสอบ':'ดูสถานะ';
        status=a.result_visible&&Number.isInteger(Number(a.correct_count))
          ? 'ส่งแล้ว · ถูก '+a.correct_count+'/'+a.total_count+' ข้อ'
          : (a.timed_out?'หมดเวลาและส่งอัตโนมัติแล้ว':'ส่งข้อสอบแล้ว · รอเปิดผล');
        tone=' submitted';
      }else if(opens&&now<opens){
        label='ยังไม่เปิดสอบ'; disabled=true; status='เปิด '+date(s.opens_at);
      }else if(fixed&&now<fixed){
        label='รอเวลาเริ่ม'; disabled=true; status='เริ่มพร้อมกัน '+date(s.fixed_start_at);
      }else if(closes&&now>=closes){
        label='ปิดรอบสอบแล้ว'; disabled=true; status='ปิด '+date(s.closes_at);
      }else if(own.length>=Number(s.max_attempts||1)){
        label='ใช้สิทธิ์ครบแล้ว'; disabled=true; status='สอบครบ '+own.length+' ครั้ง';
      }
      const scope=subjectName(s.subject_id);
      const activeNow=!disabled && a?.status!=='submitted';
      const stripeLabel=a?.status==='draft'
        ? 'กำลังสอบอยู่'
        : a?.status==='submitted'
          ? (a.result_visible?'ส่งข้อสอบแล้ว · เปิดผลแล้ว':'ส่งข้อสอบแล้ว')
          : activeNow
            ? 'เปิดสอบอยู่ในขณะนี้'
            : status;
      return '<article class="real-exam-card'+tone+(activeNow?' is-open':'')+'">'+
        '<div class="real-exam-stripe">'+esc(stripeLabel)+'</div>'+
        '<div class="real-exam-card-body"><div class="real-exam-card-main">'+
        '<h4>'+esc(s.title)+'</h4><p>'+esc(scope)+' · ชุด '+esc(String(s.set_no||2))+' · '+esc(String(s.duration_minutes))+' นาที</p>'+
        '<small>'+esc(examPolicyText(s))+'</small></div>'+
        '<button type="button" class="real-exam-action '+(activeNow?'is-danger':'')+'" data-real-exam-session="'+esc(s.session_id)+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>'+
        '</div></article>';
    }).join('');
    return '<section class="real-exam-section"><div class="real-exam-section-head"><div><span class="eyebrow">REAL EXAM</span><h3>สอบจริง</h3><p>จับเวลาจริงจากฐานข้อมูล ปิดหน้าแล้วเวลาไม่หยุด</p></div></div><div class="real-exam-list">'+cards+'</div></section>';
  }

  function renderPanel() {
    if (!bank) { panel.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดผลการฝึก…</p>'; return; }
    if (!bank.ready) {
      panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">PRACTICE</span><h2>กำลังเตรียมชุดฝึกใหม่</h2><p>กำลังเตรียมโจทย์และเฉลยสำหรับแต่ละหัวข้อ</p></div><div class="practice-toolbar"><button type="button" class="secondary" data-practice-refresh>ตรวจอีกครั้ง</button>${resultButton()}${understandingButton()}${learningButton()}</div></div>`;
      return;
    }
    const graded = bank.attempts.filter(a => a.set_no === selectedSet && a.status === 'graded');
    const total = graded.reduce((n, a) => n + a.total_count, 0), correct = graded.reduce((n, a) => n + a.correct_count, 0);
    const availableSubjects = data.subjects.filter(s => bank.counts.some(c => c.set_no === selectedSet && c.subject_id === s.subject_id));
    const percent = total ? 100 * correct / total : 0;
    panel.innerHTML = `<div class="practice-heading"><div><span class="eyebrow">MY PRACTICE</span><h2>ผลการฝึกของฉัน</h2><p>เห็นพัฒนาการทีละหัวข้อ · คะแนนเปิดเมื่อผู้ดูแลตรวจแล้ว</p></div><div class="practice-toolbar"><label class="practice-set-label">ชุดฝึก <select id="practice-set">${bank.sets.map(s => `<option value="${s.set_no}" ${s.set_no === selectedSet ? 'selected' : ''}>${esc(setLabel(s) || '—')}</option>`).join('')}</select></label><button type="button" class="secondary" data-practice-refresh ${loading ? 'disabled' : ''}>อัปเดตผล</button>${resultButton()}${examManageButton()}${understandingButton()}${learningButton()}${data.member.can_manage ? '<button type="button" class="secondary" data-review>ตรวจคำตอบนักเรียน</button>' : ''}</div></div>
      ${studentExamSection()}
      <div class="practice-overview"><div class="practice-score-ring" style="--score:${percent}%"><strong>${pct(correct, total)}</strong><span>ความถูกต้องรวม</span></div><div class="practice-overview-text"><h3>${total ? `ทำถูก ${correct} จาก ${total} ข้อที่ตรวจแล้ว` : 'เริ่มจากหนึ่งหัวข้อ แล้วค่อย ๆ ก้าวหน้า'}</h3><p>ตรวจแล้ว <b>${graded.length} / ${availableSubjects.length}</b> วิชา${bank.attempts.some(a => a.set_no === selectedSet && a.status === 'submitted') ? ' · มีคำตอบรอตรวจ' : ''}</p><small>คำนวณจากจำนวนข้อที่ถูก ÷ จำนวนข้อที่ตรวจแล้วทั้งหมด</small><small>วิชาที่ยังไม่ตรวจจะแสดงสถานะและยังไม่รวมในเปอร์เซ็นต์</small></div></div>
      <div class="practice-subjects">${availableSubjects.map(s => {
        const a = ownAttempt(s.subject_id), n = ownAnswers(s.subject_id).length;
        const count = bank.counts.find(c => c.set_no === selectedSet && c.subject_id === s.subject_id).total_count;
        return `<button type="button" class="practice-subject ${a?.status === 'graded' ? 'is-graded' : ''}" data-practice-subject="${s.subject_id}"><span class="practice-subject-name">${esc(s.subject_name_th)}</span><strong>${a?.status === 'graded' ? pct(a.correct_count, a.total_count) : a?.status === 'submitted' ? 'รอตรวจ' : `${n} / ${count}`}</strong><span>${a?.status === 'graded' ? `ถูก ${a.correct_count} / ${a.total_count} ข้อ · ดูเฉลย ↗` : a?.status === 'submitted' ? 'ส่งคำตอบครบแล้ว' : n ? 'ตอบแล้ว · ทำต่อ ↗' : data.member.can_study ? 'เริ่มทำชุดนี้ ↗' : 'เปิดดูโจทย์ ↗'}</span><progress value="${n}" max="${count}" aria-label="ตอบแล้ว ${n} จาก ${count} ข้อ"></progress></button>`;
      }).join('')}</div>
      <details class="practice-topic-results" ${openTopics ? 'open' : ''}><summary>ผลรายหัวข้อ · รวมชุดที่ตรวจแล้ว</summary><div class="practice-result-tabs">${data.subjects.map(s => `<button type="button" class="tab ${s.subject_id === resultSubject ? 'active' : ''}" data-result-subject="${s.subject_id}" aria-pressed="${s.subject_id === resultSubject}">${esc(s.subject_name_th)}</button>`).join('')}</div><div class="practice-result-list">${data.topics.filter(t => t.subject_id === resultSubject).map(t => {
        const r = topicResult(t.topic_id);
        const hasQuestion = bank.topics.some(q => q.set_no === selectedSet && q.topic_id === t.topic_id);
        return `<div class="practice-result-row"><span><small>${esc(t.topic_id)}</small>${esc(t.topic_name_th)} ${topicLearningBadge(data, t.topic_id)}</span><b class="${r.total ? r.correct === r.total ? 'correct-text' : 'review-text' : ''}">${pct(r.correct, r.total)}</b><small>${r.total ? `ถูก ${r.correct}/${r.total} ชุด` : 'ยังไม่มีผลตรวจ'}</small>${hasQuestion ? `<button type="button" data-practice="${esc(t.topic_id)}">${ownAttempt(t.subject_id)?.status === 'graded' ? 'ดูเฉลย' : 'เปิดโจทย์'} ↗</button>` : ''}</div>`;
      }).join('')}</div></details>
      ${bank.sets.length > 1 ? `<div class="practice-set-history"><h3>ความถูกต้องรวมแต่ละชุด</h3>${bank.sets.map(s => { const a = bank.attempts.filter(x => x.set_no === s.set_no && x.status === 'graded'); return `<span>${esc(setLabel(s) || '—')} <b>${pct(a.reduce((n, x) => n + x.correct_count, 0), a.reduce((n, x) => n + x.total_count, 0))}</b> <small>ตรวจแล้ว ${a.length} วิชา</small></span>`; }).join('')}</div>` : ''}`;
    panel.querySelector('.practice-topic-results').addEventListener('toggle', event => { openTopics = event.target.open; });
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const results=await Promise.all([
        api(apiPath+'?route=summary'),
        data.member.can_study
          ? api(apiPath+'?route=exam-sessions').catch(error=>({sessions:[],attempts:[],exam_error:error.message}))
          : Promise.resolve(examSessionsData),
        refreshLearning()
      ]);
      bank=results[0];
      if(results[1]) examSessionsData=results[1];
      if (bank.ready && !bank.sets.some(s => s.set_no === selectedSet)) selectedSet = bank.sets[0].set_no;
      renderPanel(); rerender();
    } catch (error) {
      panel.innerHTML = `<div class="practice-heading"><div><h2>ผลการฝึกของฉัน</h2><p role="alert">${esc(error.message)}</p></div><button type="button" class="secondary" data-practice-refresh>ลองอีกครั้ง</button></div>`;
    } finally { loading = false; panel.querySelector('[data-practice-refresh]')?.removeAttribute('disabled'); }
  }


  const localInput = value => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
  };

  const examPolicyText = s => {
    const start = s.start_policy === 'fixed'
      ? 'เริ่มพร้อมกัน '+date(s.fixed_start_at)
      : 'จับเวลาเมื่อกดเริ่ม';
    const audience = s.audience_mode === 'selected' ? 'เฉพาะรายชื่อที่เลือก' : 'นักเรียนทุกคน';
    const result = s.result_policy === 'immediate' ? 'เปิดคะแนนทันที'
      : s.result_policy === 'scheduled' ? 'เปิดคะแนน '+date(s.result_release_at)
      : 'ครูเปิดคะแนนภายหลัง';
    return start+' · '+audience+' · '+result;
  };

  function renderExamManager() {
    const sessions = examSessionsData?.sessions || [];
    document.querySelector('#practice-title').textContent = 'จัดการรอบสอบจริง '+examTrack;
    modalBody.innerHTML =
      '<div class="exam-manager-head">'+
        '<div><span class="eyebrow">REAL EXAM</span><h3>รอบสอบจริง</h3><p>ครูและผู้ดูแลกำหนดเวลา เงื่อนไข และผู้เข้าสอบได้เอง</p></div>'+
        '<button type="button" class="practice-primary" data-exam-new>+ สร้างรอบสอบ</button>'+
      '</div>'+
      (sessions.length
        ? '<div class="exam-session-list">'+sessions.map(s=>{
            const canEdit = data.member.can_manage || s.created_by === data.member.member_id;
            return '<article class="exam-session-card">'+
              '<div class="exam-session-main">'+
                '<div class="exam-session-title"><span class="practice-badge '+(s.is_published?'correct':'')+'">'+(s.is_published?'เผยแพร่แล้ว':'ฉบับร่าง')+'</span><h4>'+esc(s.title)+'</h4></div>'+
                '<p>'+esc(subjectName(s.subject_id))+' · ชุด '+esc(String(s.set_no||2))+' · '+esc(String(s.duration_minutes))+' นาที</p>'+
                '<small>'+esc(examPolicyText(s))+'</small>'+
                '<small>เปิด: '+esc(date(s.opens_at))+' · ปิด: '+esc(date(s.closes_at))+'</small>'+
                '<div class="exam-session-stats"><span><b>'+Number(s.student_count||0)+'</b> นักเรียนเริ่มแล้ว</span><span><b>'+Number(s.submitted_count||0)+'</b> ส่งแล้ว</span><span><b>'+Number(s.attempt_count||0)+'</b> ครั้งสอบ</span></div>'+
              '</div>'+
              '<div class="exam-session-actions">'+
                (Number(s.attempt_count||0)>0?'<button type="button" class="practice-primary" data-exam-results="'+esc(s.session_id)+'">ดูผลสอบ</button>':'')+
                (canEdit?'<button type="button" class="secondary" data-exam-edit="'+esc(s.session_id)+'">แก้ไข</button>':'')+
                (canEdit&&s.audience_mode==='selected'?'<button type="button" class="secondary" data-exam-members="'+esc(s.session_id)+'">รายชื่อนักเรียน</button>':'')+
                (canSeeResults()&&Number(s.submitted_count||0)>0&&s.result_policy==='manual'?'<button type="button" class="secondary" data-exam-release-results="'+esc(s.session_id)+'">เปิดคะแนน</button>':'')+
                (canSeeResults()&&Number(s.submitted_count||0)>0&&s.answer_policy==='manual'?'<button type="button" class="secondary" data-exam-release-answers="'+esc(s.session_id)+'">เปิดคะแนน + เฉลย</button>':'')+
                (canEdit&&Number(s.attempt_count||0)===0?'<button type="button" class="secondary danger" data-exam-delete="'+esc(s.session_id)+'">ลบ</button>':'')+
              '</div>'+
            '</article>';
          }).join('')+'</div>'
        : '<div class="empty">ยังไม่มีรอบสอบจริง กด “สร้างรอบสอบ” เพื่อเริ่มต้น</div>');
    modal.scrollTop = 0;
  }

  function renderExamForm(item=null) {
    examEditingId = item?.session_id || null;
    const subjectId = item?.subject_id || (isALevel ? (getSubject() || data.subjects[0]?.subject_id) : 'ALL');
    const duration = item?.duration_minutes || (isALevel ? (data.subjects.find(s=>s.subject_id===subjectId)?.duration_minutes || 90) : 180);
    const subjectOptions = (isALevel ? [] : [{subject_id:'ALL',subject_name_th:'ข้อสอบทั้งชุด · ทุกวิชา'}]).concat(data.subjects);
    const originalSets = isALevel ? [{set_no:2,label:'ชุด 2 · ข้อสอบจริง 2568'}] : ((bank?.sets||[]).filter(x=>x.source_type==='original_exam').length ? (bank?.sets||[]).filter(x=>x.source_type==='original_exam') : [{set_no:2,label:'ชุด 2 · ข้อสอบจริงเตรียมทหาร'}]);
    const examSetNo = Number(item?.set_no || originalSets[0]?.set_no || 2);
    const defaultExamTitle = isALevel
      ? 'สอบจริง A-Level · '+subjectName(subjectId)
      : 'สอบจริงเตรียมทหาร · '+(subjectId==='ALL'?'ทั้งชุดทุกวิชา':subjectName(subjectId));
    document.querySelector('#practice-title').textContent = item ? 'แก้ไขรอบสอบจริง' : 'สร้างรอบสอบจริง';
    modalBody.innerHTML =
      '<button type="button" class="secondary" data-exam-list>← กลับรายการรอบสอบ</button>'+
      '<div class="exam-form">'+
        '<label class="exam-field exam-wide"><span>ชื่อรอบสอบ</span><input id="exam-title" maxlength="160" required value="'+esc(item?.title||defaultExamTitle)+'" placeholder="'+esc(isALevel?'เช่น สอบจำลอง A-Level คณิตศาสตร์ ครั้งที่ 1':'เช่น สอบจำลองเตรียมทหาร ชุด 2 ครั้งที่ 1')+'"></label>'+
        '<label class="exam-field"><span>'+(isALevel?'วิชา':'ขอบเขตข้อสอบ')+'</span><select id="exam-subject">'+subjectOptions.map(s=>'<option value="'+esc(s.subject_id)+'" '+(s.subject_id===subjectId?'selected':'')+'>'+esc(s.subject_name_th)+'</option>').join('')+'</select></label>'+
        '<label class="exam-field"><span>ชุดข้อสอบ</span><select id="exam-set" '+(isALevel?'disabled':'')+'>'+originalSets.map(x=>'<option value="'+esc(x.set_no)+'" '+(Number(x.set_no)===examSetNo?'selected':'')+'>'+esc(setLabel(x)||x.label||('ชุด '+x.set_no))+'</option>').join('')+'</select></label>'+
        '<label class="exam-field"><span>เวลาสอบ (นาที)</span><input id="exam-duration" type="number" min="1" max="'+(isALevel?'480':'600')+'" value="'+esc(duration)+'"></label>'+
        '<label class="exam-field"><span>จำนวนครั้งที่สอบได้</span><input id="exam-attempts" type="number" min="1" max="10" value="'+esc(item?.max_attempts||1)+'"></label>'+
        '<label class="exam-field"><span>เปิดให้เข้าสอบ</span><input id="exam-opens" type="datetime-local" value="'+esc(localInput(item?.opens_at))+'"></label>'+
        '<label class="exam-field"><span>ปิดรับการสอบ</span><input id="exam-closes" type="datetime-local" value="'+esc(localInput(item?.closes_at))+'"></label>'+
        '<label class="exam-field"><span>วิธีเริ่มจับเวลา</span><select id="exam-start-policy"><option value="on_click" '+(item?.start_policy!=='fixed'?'selected':'')+'>เริ่มเมื่อผู้สอบกด “เริ่มสอบ”</option><option value="fixed" '+(item?.start_policy==='fixed'?'selected':'')+'>เริ่มพร้อมกันตามเวลาที่กำหนด</option></select></label>'+
        '<label class="exam-field"><span>เวลาเริ่มพร้อมกัน</span><input id="exam-fixed-start" type="datetime-local" value="'+esc(localInput(item?.fixed_start_at))+'"></label>'+
        '<label class="exam-field"><span>ผู้มีสิทธิ์สอบ</span><select id="exam-audience"><option value="all_students" '+(item?.audience_mode!=='selected'?'selected':'')+'>นักเรียน School ทุกคน</option><option value="selected" '+(item?.audience_mode==='selected'?'selected':'')+'>เฉพาะรายชื่อที่เลือก</option></select></label>'+
        '<label class="exam-field"><span>การเปิดคะแนน</span><select id="exam-result-policy"><option value="manual" '+(!item||item.result_policy==='manual'?'selected':'')+'>ครูเปิดภายหลัง</option><option value="immediate" '+(item?.result_policy==='immediate'?'selected':'')+'>เปิดทันทีหลังส่ง</option><option value="scheduled" '+(item?.result_policy==='scheduled'?'selected':'')+'>เปิดตามเวลาที่กำหนด</option></select></label>'+
        '<label class="exam-field"><span>เวลาเปิดคะแนน</span><input id="exam-result-release" type="datetime-local" value="'+esc(localInput(item?.result_release_at))+'"></label>'+
        '<label class="exam-field"><span>การเปิดเฉลย</span><select id="exam-answer-policy"><option value="manual" '+(!item||item.answer_policy==='manual'?'selected':'')+'>ครูเปิดภายหลัง</option><option value="with_result" '+(item?.answer_policy==='with_result'?'selected':'')+'>เปิดพร้อมคะแนน</option><option value="scheduled" '+(item?.answer_policy==='scheduled'?'selected':'')+'>เปิดตามเวลาที่กำหนด</option><option value="never" '+(item?.answer_policy==='never'?'selected':'')+'>ไม่เปิดเฉลย</option></select></label>'+
        '<label class="exam-field"><span>เวลาเปิดเฉลย</span><input id="exam-answer-release" type="datetime-local" value="'+esc(localInput(item?.answer_release_at))+'"></label>'+
        '<label class="exam-field exam-wide"><span>คำชี้แจงก่อนสอบ</span><textarea id="exam-instructions" rows="3" placeholder="เช่น ห้ามใช้เครื่องคิดเลข เมื่อกดเริ่มแล้วเวลาจะเดินต่อเนื่อง">'+esc(item?.instructions||'')+'</textarea></label>'+
        '<div class="exam-options exam-wide">'+
          '<label><input id="exam-submit-early" type="checkbox" '+(item?.allow_submit_early!==false?'checked':'')+'> อนุญาตส่งก่อนหมดเวลา</label>'+
          '<label><input id="exam-require-all" type="checkbox" '+(item?.require_all_answers?'checked':'')+'> ต้องตอบครบก่อนส่งก่อนเวลา</label>'+
          '<label><input id="exam-resume" type="checkbox" '+(item?.allow_resume!==false?'checked':'')+'> ออกจากหน้าแล้วกลับมาทำต่อได้ (เวลาไม่หยุด)</label>'+
          '<label><input id="exam-published" type="checkbox" '+(item?.is_published?'checked':'')+'> เผยแพร่ให้นักเรียนเห็น</label>'+
        '</div>'+
        '<div class="exam-form-note exam-wide">หลังมีนักเรียนเริ่มสอบแล้ว ระบบจะล็อกเงื่อนไขหลัก เช่น วิชา เวลา และกลุ่มผู้สอบ เพื่อไม่ให้กติกาเปลี่ยนกลางการสอบ</div>'+
        '<div class="exam-form-actions exam-wide"><button type="button" class="practice-primary" data-exam-save>บันทึกรอบสอบ</button></div>'+
      '</div>';
    modal.scrollTop = 0;
  }

  async function openExamManager() {
    if (!canSeeResults() || busy) return;
    const ticket=++requestNo;
    busy=true; session=null; returnView=null; examEditingId=null; examMembersData=null;
    document.querySelector('#practice-title').textContent='จัดการรอบสอบจริง '+examTrack;
    document.querySelector('#practice-close').disabled=true;
    modalBody.innerHTML='<p class="practice-muted" role="status">กำลังเปิดรายการรอบสอบ…</p>';
    if(!modal.open) modal.showModal();
    try {
      examSessionsData=await api(apiPath+'?route=exam-sessions');
      if(ticket!==requestNo||!modal.open) return;
      renderExamManager();
    } catch(error) {
      modalBody.innerHTML='<p class="practice-inline-error" role="alert">'+esc(error.message)+'</p>';
    } finally {
      busy=false; document.querySelector('#practice-close').disabled=false;
    }
  }

  async function saveExamForm() {
    if(busy) return;
    const value=id=>modalBody.querySelector(id)?.value || '';
    const checked=id=>Boolean(modalBody.querySelector(id)?.checked);
    const titleInput=modalBody.querySelector('#exam-title');
    const title=String(titleInput?.value||'').trim();
    if(!title || title.length>160){
      const box=modalBody.querySelector('.exam-form-note');
      if(box) box.innerHTML='<span class="practice-inline-error">กรุณาระบุชื่อรอบสอบไม่เกิน 160 ตัวอักษร</span>';
      titleInput?.focus();
      titleInput?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const payload={
      ...(examEditingId?{session_id:examEditingId}:{}),
      title,
      subject_id:value('#exam-subject'),
      set_no:Number(value('#exam-set')||2),
      duration_minutes:Number(value('#exam-duration')),
      max_attempts:Number(value('#exam-attempts')),
      opens_at:value('#exam-opens')?new Date(value('#exam-opens')).toISOString():null,
      closes_at:value('#exam-closes')?new Date(value('#exam-closes')).toISOString():null,
      start_policy:value('#exam-start-policy'),
      fixed_start_at:value('#exam-fixed-start')?new Date(value('#exam-fixed-start')).toISOString():null,
      audience_mode:value('#exam-audience'),
      result_policy:value('#exam-result-policy'),
      result_release_at:value('#exam-result-release')?new Date(value('#exam-result-release')).toISOString():null,
      answer_policy:value('#exam-answer-policy'),
      answer_release_at:value('#exam-answer-release')?new Date(value('#exam-answer-release')).toISOString():null,
      instructions:value('#exam-instructions'),
      allow_submit_early:checked('#exam-submit-early'),
      require_all_answers:checked('#exam-require-all'),
      allow_resume:checked('#exam-resume'),
      is_published:checked('#exam-published')
    };
    busy=true;
    const button=modalBody.querySelector('[data-exam-save]');
    if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}
    try {
      const result=await post('exam-session-save',payload);
      notice('บันทึกรอบสอบแล้ว');
      examEditingId=result.item.session_id;
      examSessionsData=await api(apiPath+'?route=exam-sessions');
      if(result.item.audience_mode==='selected') await openExamMembers(result.item.session_id);
      else renderExamManager();
    } catch(error) {
      notice(error.message);
      const box=modalBody.querySelector('.exam-form-note');
      if(box) box.innerHTML='<span class="practice-inline-error">'+esc(error.message)+'</span>';
    } finally {
      busy=false;
      const currentButton=modalBody.querySelector('[data-exam-save]');
      if(currentButton){
        currentButton.disabled=false;
        currentButton.textContent='บันทึกรอบสอบ';
      }
    }
  }


  async function releaseExamResults(id,withAnswers=false) {
    if(busy) return;
    const s=(examSessionsData?.sessions||[]).find(x=>x.session_id===id);
    if(!s) return;
    const message=withAnswers?'ยืนยันเปิดคะแนนและเฉลยให้นักเรียนที่ส่งแล้ว?':'ยืนยันเปิดคะแนนให้นักเรียนที่ส่งแล้ว?';
    if(!confirm(message)) return;
    busy=true;
    try{
      await post('exam-release-results',{session_id:s.session_id,with_answers:withAnswers});
      notice(withAnswers?'เปิดคะแนนและเฉลยแล้ว':'เปิดคะแนนแล้ว');
      examSessionsData=await api(apiPath+'?route=exam-sessions');
      renderExamManager();
    }catch(error){notice(error.message);}
    finally{busy=false;}
  }

  async function openExamMembers(id) {
    if(busy) return;
    const s=(examSessionsData?.sessions||[]).find(x=>x.session_id===id);
    if(!s) return;
    busy=true; examEditingId=id;
    document.querySelector('#practice-title').textContent='รายชื่อนักเรียน · '+s.title;
    modalBody.innerHTML='<p class="practice-muted" role="status">กำลังเปิดรายชื่อนักเรียน…</p>';
    try {
      examMembersData=await api(apiPath+'?route=exam-members&session_id='+encodeURIComponent(id));
      const selected=new Set(examMembersData.selected||[]);
      modalBody.innerHTML=
        '<button type="button" class="secondary" data-exam-list>← กลับรายการรอบสอบ</button>'+
        '<div class="exam-member-head"><div><h3>'+esc(s.title)+'</h3><p>เลือกนักเรียนที่มีสิทธิ์เข้าสอบรอบนี้</p></div><button type="button" class="secondary" data-exam-select-all>เลือกทั้งหมด</button></div>'+
        '<input class="exam-member-search" id="exam-member-search" type="search" placeholder="ค้นหาชื่อนักเรียนหรือรหัสสมาชิก…">'+
        '<div class="exam-member-list" id="exam-member-list">'+examMembersData.members.map(m=>
          '<label class="exam-member-row" data-member-text="'+esc((m.member_name+' '+m.member_id).toLowerCase())+'"><input type="checkbox" data-exam-member value="'+esc(m.member_id)+'" '+(selected.has(m.member_id)?'checked':'')+'><span><b>'+esc(m.member_name)+'</b><small>'+esc(m.member_id)+'</small></span></label>'
        ).join('')+'</div>'+
        '<div class="exam-form-actions"><button type="button" class="practice-primary" data-exam-members-save>บันทึกรายชื่อ</button></div>';
    } catch(error) {
      modalBody.innerHTML='<p class="practice-inline-error" role="alert">'+esc(error.message)+'</p>';
    } finally { busy=false; }
  }

  async function saveExamMembers() {
    if(busy||!examEditingId) return;
    const ids=[...modalBody.querySelectorAll('[data-exam-member]:checked')].map(x=>x.value);
    busy=true;
    try {
      await post('exam-members-save',{session_id:examEditingId,member_ids:ids});
      notice('บันทึกรายชื่อนักเรียน '+ids.length+' คนแล้ว');
      examSessionsData=await api(apiPath+'?route=exam-sessions');
      renderExamManager();
    } catch(error) { notice(error.message); }
    finally { busy=false; }
  }

  async function deleteExamSession(id) {
    if(busy||!id) return;
    if(!confirm('ยืนยันลบรอบสอบนี้?')) return;
    busy=true;
    try {
      await post('exam-session-delete',{session_id:id});
      notice('ลบรอบสอบแล้ว');
      examSessionsData=await api(apiPath+'?route=exam-sessions');
      renderExamManager();
    } catch(error) { notice(error.message); }
    finally { busy=false; }
  }


  const realExamResponseOf = answer => answer?.response ?? answer?.selected_answer;

  function realExamHasResponse(q,value) {
    if(q.response_mode==='numeric') return value!==undefined && value!==null && String(value).trim()!=='';
    if(q.response_mode==='complex') {
      if(!value||typeof value!=='object'||Array.isArray(value)) return false;
      return (q.part_keys||[]).every(k=>[1,2].includes(Number(value[k])));
    }
    return Number.isInteger(Number(value))&&Number(value)>=1;
  }

  function realExamResultText(s) {
    if(s.result_policy==='immediate') return 'เปิดคะแนนทันทีหลังส่ง';
    if(s.result_policy==='scheduled') return 'เปิดคะแนน '+date(s.result_release_at);
    return 'ครู / ผู้ดูแลเป็นผู้เปิดคะแนน';
  }

  function realExamAnswerText(s) {
    if(s.answer_policy==='with_result') return 'เปิดเฉลยพร้อมคะแนน';
    if(s.answer_policy==='scheduled') return 'เปิดเฉลย '+date(s.answer_release_at);
    if(s.answer_policy==='never') return 'ไม่เปิดเฉลย';
    return 'ครู / ผู้ดูแลเป็นผู้เปิดเฉลย';
  }

  function realExamIntroCard(s,a) {
    const scope=subjectName(s.subject_id);
    const start=s.start_policy==='fixed'?'เริ่มพร้อมกัน '+date(s.fixed_start_at):'จับเวลาเมื่อกดเริ่มสอบ';
    return '<div class="real-exam-intro">'+
      '<span class="eyebrow">REAL EXAM · '+esc(examTrack)+'</span>'+
      '<h3>'+esc(s.title)+'</h3>'+
      '<div class="real-exam-facts">'+
        '<span><b>'+esc(scope)+'</b><small>ขอบเขตข้อสอบ</small></span>'+
        '<span><b>'+esc(String(s.duration_minutes))+' นาที</b><small>เวลาสอบ</small></span>'+
        '<span><b>'+esc(String(s.max_attempts))+' ครั้ง</b><small>จำนวนครั้งที่สอบได้</small></span>'+
      '</div>'+
      '<div class="real-exam-rules">'+
        '<p><b>เวลา:</b> '+esc(start)+'</p>'+
        '<p><b>เปิดสอบ:</b> '+esc(date(s.opens_at))+' · <b>ปิด:</b> '+esc(date(s.closes_at))+'</p>'+
        '<p><b>ส่งก่อนเวลา:</b> '+(s.allow_submit_early?'ได้':'ไม่ได้')+(s.require_all_answers?' · ต้องตอบครบ':'')+'</p>'+
        '<p><b>ออกแล้วกลับมา:</b> '+(s.allow_resume?'ได้ แต่เวลายังคงเดินต่อ':'ไม่ได้')+'</p>'+
        '<p><b>ผลสอบ:</b> '+esc(realExamResultText(s))+'</p>'+
        '<p><b>เฉลย:</b> '+esc(realExamAnswerText(s))+'</p>'+
      '</div>'+
      (s.instructions?'<div class="real-exam-instructions"><b>คำชี้แจง</b><p>'+esc(s.instructions)+'</p></div>':'')+
      '<div class="real-exam-warning"><b>เมื่อเริ่มสอบแล้ว เวลาจะนับจากฐานข้อมูลและไม่หยุดเมื่อรีเฟรชหรือปิดหน้า</b></div>'+
      (a?.status==='draft'
        ? '<button type="button" class="practice-primary real-exam-start" data-real-exam-start="'+esc(s.session_id)+'">กลับเข้าสอบต่อ</button>'
        : '<button type="button" class="practice-primary real-exam-start" data-real-exam-start="'+esc(s.session_id)+'">ยืนยันและเริ่มสอบ</button>')+
    '</div>';
  }

  async function openRealExamIntro(id) {
    learningView = false;
    if(busy) return;
    const s=(examSessionsData?.sessions||[]).find(x=>x.session_id===id);
    if(!s) return notice('ไม่พบรอบสอบนี้');
    const attempts=(examSessionsData?.attempts||[]).filter(a=>a.session_id===id).sort((a,b)=>Number(b.attempt_no)-Number(a.attempt_no));
    const a=attempts[0];
    session=null; understandingReturn=false;
    realExam=null;
    clearInterval(realExamTimer); realExamTimer=null; realExamWarnings.clear();
    document.querySelector('#practice-title').textContent='สอบจริง · '+examTrack;
    if(!modal.open) modal.showModal();
    if(a?.status==='submitted'){
      busy=true;
      modalBody.innerHTML='<p class="practice-muted" role="status">กำลังเปิดสถานะการสอบ…</p>';
      try{
        const result=await api(apiPath+'?route=exam-open&session_id='+encodeURIComponent(id));
        await loadRealExam(result);
      }catch(error){modalBody.innerHTML='<p class="practice-inline-error" role="alert">'+esc(error.message)+'</p>';}
      finally{busy=false;}
      return;
    }
    if(a?.status==='draft'){
      await beginRealExam(id);
      return;
    }
    modalBody.innerHTML=realExamIntroCard(s,a);
    modal.scrollTop=0;
  }

  async function loadRealExam(result) {
    await attachUnderstanding(result, 'exam');
    await attachLearning(result, Boolean(result.staff_review));
    realExam=result;
    realExamSaved=new Map((result.answers||[]).map(a=>[a.question_id,a]));
    realExamChoices=new Map((result.answers||[]).map(a=>[a.question_id,realExamResponseOf(a)]));
    realExamClockOffset=result.server_time?new Date(result.server_time).getTime()-Date.now():0;
    realExamWarnings.clear();
    if(result.attempt?.status==='submitted') realExamIndex=-1;
    else {
      realExamIndex=(result.questions||[]).findIndex(q=>!realExamSaved.has(q.question_id));
      if(realExamIndex<0) realExamIndex=0;
    }
    startRealExamTimer();
    renderRealExam();
  }

  async function beginRealExam(id) {
    if(busy) return;
    busy=true;
    document.querySelector('#practice-title').textContent='สอบจริง · '+examTrack;
    modalBody.innerHTML='<p class="practice-muted" role="status">กำลังเริ่มจับเวลาและเปิดข้อสอบ…</p>';
    if(!modal.open) modal.showModal();
    try{
      const result=await post('exam-start',{session_id:id});
      await loadRealExam(result);
      notice('เริ่มสอบแล้ว · เวลาจะเดินต่อเนื่องจนหมดเวลา');
      examSessionsData=await api(apiPath+'?route=exam-sessions').catch(()=>examSessionsData);
      renderPanel();
    }catch(error){
      modalBody.innerHTML='<p class="practice-inline-error" role="alert">'+esc(error.message)+'</p>'+
        '<button type="button" class="secondary" data-real-exam-close>ปิด</button>';
    }finally{busy=false;}
  }

  function realExamRemainingMs() {
    if(!realExam?.attempt?.deadline_at) return 0;
    return new Date(realExam.attempt.deadline_at).getTime()-(Date.now()+realExamClockOffset);
  }

  function formatExamClock(ms) {
    const sec=Math.max(0,Math.ceil(ms/1000));
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    const p=n=>String(n).padStart(2,'0');
    return h>0?p(h)+':'+p(m)+':'+p(s):p(m)+':'+p(s);
  }

  function updateRealExamClock() {
    if(!realExam||realExam.attempt?.status!=='draft') return;
    const ms=realExamRemainingMs();
    const el=modalBody.querySelector('[data-real-exam-clock]');
    if(el){
      el.textContent=formatExamClock(ms);
      el.closest('.real-exam-clock')?.classList.toggle('urgent',ms<=5*60*1000);
      el.closest('.real-exam-clock')?.classList.toggle('critical',ms<=60*1000);
    }
    for(const [limit,label] of [[10,'เหลือเวลา 10 นาที'],[5,'เหลือเวลา 5 นาที'],[1,'เหลือเวลา 1 นาที']]){
      if(ms<=limit*60*1000 && ms>0 && !realExamWarnings.has(limit)){
        realExamWarnings.add(limit); notice(label);
      }
    }
    if(ms<=0 && !realExamSubmitting) submitRealExam(true);
  }

  function startRealExamTimer() {
    clearInterval(realExamTimer); realExamTimer=null;
    if(realExam?.attempt?.status!=='draft') return;
    realExamTimer=setInterval(updateRealExamClock,1000);
    setTimeout(updateRealExamClock,0);
  }

  function realExamGrid() {
    if(!realExam?.questions?.length) return '';
    return '<details class="practice-grid-wrap real-exam-grid"><summary>ไปยังข้อ · เขียวหมายถึงบันทึกคำตอบแล้ว</summary><div class="practice-question-grid">'+
      realExam.questions.map((q,i)=>{
        const a=realExamSaved.get(q.question_id);
        const incorrect=realExam.can_review&&a&&a.is_correct===false;
        return '<button type="button" class="'+(a?(incorrect?'incorrect':'answered'):'')+' '+(i===realExamIndex?'current':'')+'" data-real-exam-index="'+i+'">'+(i+1)+(a?'<span aria-hidden="true">✓</span>':'')+'</button>';
      }).join('')+
    '</div></details>';
  }

  function realExamAnswerKey(q) {
    if(!realExam?.can_review||q.answer_key==null) return '';
    if(q.response_mode==='numeric'){
      const values=Array.isArray(q.answer_key)?q.answer_key:[q.answer_key];
      return '<h4>เฉลย</h4><p class="practice-correct-answer">'+esc(values.join(' หรือ '))+'</p>';
    }
    if(q.response_mode==='complex'){
      const key=q.answer_key||{};
      return '<h4>เฉลย</h4><div class="practice-complex-key">'+(q.part_keys||[]).map((part,i)=>{
        const values=Array.isArray(key[part])?key[part]:[key[part]];
        const nums=values.map(Number);
        const label=nums.includes(1)&&nums.includes(2)?'ยอมรับทั้ง ใช่ และ ไม่ใช่':nums.includes(1)?'ใช่':'ไม่ใช่';
        return '<p><b>'+esc(part)+'</b> '+esc(q.choices?.[i]||'')+'<span>'+esc(label)+'</span></p>';
      }).join('')+'</div>';
    }
    const values=(Array.isArray(q.answer_key)?q.answer_key:[q.answer_key]).map(Number).filter(Number.isFinite);
    return '<h4>เฉลย · ตัวเลือก '+esc(values.join(' หรือ '))+'</h4><div class="practice-correct-answer">'+values.map(k=>'<p>'+k+'. '+esc(q.choices?.[k-1]||'')+'</p>').join('')+'</div>';
  }

  function realExamControl(q,selected) {
    const editable=realExam?.attempt?.status==='draft'&&!realExamSubmitting;
    if(q.response_mode==='numeric'){
      return '<div class="practice-numeric-wrap"><label for="real-exam-numeric">คำตอบตัวเลข</label><input id="real-exam-numeric" class="practice-numeric-input" type="text" inputmode="decimal" autocomplete="off" value="'+esc(selected??'')+'" placeholder="กรอกคำตอบ เช่น 1.28" '+(!editable?'disabled':'')+'><small>กด “ยืนยันและไปข้อต่อไป” เพื่อบันทึกคำตอบ</small></div>';
    }
    if(q.response_mode==='complex'){
      const value=selected&&typeof selected==='object'&&!Array.isArray(selected)?selected:{};
      return '<fieldset class="practice-complex"><legend>เลือก ใช่ / ไม่ใช่ ให้ครบทุกข้อความ</legend>'+
        (q.part_keys||[]).map((part,i)=>{
          const current=Number(value[part]);
          return '<div class="practice-complex-item"><p><b>'+esc(part)+'</b> '+esc(q.choices?.[i]||part)+'</p><div class="practice-binary">'+
            '<label class="'+(current===1?'selected':'')+'"><input type="radio" name="real-exam-part-'+i+'" data-real-exam-part="'+esc(part)+'" value="1" '+(current===1?'checked':'')+' '+(!editable?'disabled':'')+'> ใช่</label>'+
            '<label class="'+(current===2?'selected':'')+'"><input type="radio" name="real-exam-part-'+i+'" data-real-exam-part="'+esc(part)+'" value="2" '+(current===2?'checked':'')+' '+(!editable?'disabled':'')+'> ไม่ใช่</label>'+
          '</div></div>';
        }).join('')+
      '</fieldset>';
    }
    return '<fieldset class="practice-choices"><legend class="sr-only">เลือกคำตอบหนึ่งตัวเลือก</legend>'+
      (q.choices||[]).map((text,i)=>{
        const value=i+1;
        const keys=realExam?.can_review?(Array.isArray(q.answer_key)?q.answer_key:[q.answer_key]).map(Number):[];
        const correct=keys.includes(value);
        return '<label class="practice-choice '+(Number(selected)===value?'selected ':'')+(correct?'answer-key':'')+'"><input type="radio" name="real-exam-choice" value="'+value+'" '+(Number(selected)===value?'checked':'')+' '+(!editable?'disabled':'')+'><span class="practice-choice-number">'+value+'</span><span>'+esc(text)+'</span>'+(correct?'<b class="practice-choice-key">เฉลย</b>':'')+'</label>';
      }).join('')+
    '</fieldset>';
  }

  function realExamTimerHeader() {
    const a=realExam.attempt, n=realExam.questions.length;
    if(a.status!=='draft'){
      const back=understandingReturn?'<button type="button" class="secondary" data-understanding-list>← กลับรายการความเข้าใจ</button>':examReportReturn?'<button type="button" class="secondary" data-exam-review-back>← ผลสอบรายคน</button>':'';
      const context=realExam.staff_review?'<div class="practice-student-context">'+back+'<div><strong>'+esc(realExam.student.member_name)+'</strong><small>'+esc(realExam.exam_session.title)+' · ครั้งที่ '+esc(a.attempt_no)+'</small></div></div>':understandingReturn?back:'';
      return context+'<div class="real-exam-statusbar"><span>ส่งข้อสอบแล้ว '+esc(date(a.submitted_at))+'</span><span>ตอบ '+realExamSaved.size+' / '+n+' ข้อ</span></div>';
    }
    return '<div class="real-exam-statusbar"><div class="real-exam-clock"><small>เวลาคงเหลือ</small><strong data-real-exam-clock>'+formatExamClock(realExamRemainingMs())+'</strong></div><div><b>ตอบแล้ว '+realExamSaved.size+' / '+n+' ข้อ</b><small>หมดเวลา '+esc(date(a.deadline_at))+'</small></div></div>';
  }

  function renderRealExam() {
    if(!realExam) return;
    const s=realExam.exam_session, a=realExam.attempt, n=realExam.questions.length;
    document.querySelector('#practice-title').textContent=realExam.staff_review?realExam.student.member_name+' · ผลสอบจริง':'สอบจริง · '+s.title;
    document.querySelector('#practice-close').disabled=realExamSubmitting;

    if(a.status==='submitted' && realExamIndex<0){
      const score=a.result_visible&&Number.isInteger(Number(a.correct_count))
        ? '<div class="real-exam-score"><strong>'+pct(a.correct_count,a.total_count)+'</strong><span>ถูก '+a.correct_count+' / '+a.total_count+' ข้อ</span></div>'
        : '<div class="real-exam-score pending"><strong>ส่งแล้ว</strong><span>'+esc(realExamResultText(s))+'</span></div>';
      modalBody.innerHTML=realExamTimerHeader()+
        '<div class="real-exam-complete"><span class="eyebrow">EXAM SUBMITTED</span><h3>'+(a.timed_out?'หมดเวลา · ระบบส่งข้อสอบอัตโนมัติ':'ส่งข้อสอบเรียบร้อย')+'</h3>'+
        score+
        '<p>'+esc(realExam.staff_review?'มุมมองครูและผู้ดูแล · คำตอบหลังส่งข้อสอบ':realExamAnswerText(s))+'</p>'+
        realExamSubjectTable()+
        (realExam.can_review?'<button type="button" class="practice-primary" data-real-exam-review>ทบทวนคำตอบและเฉลย</button>':'')+
        '<button type="button" class="secondary" data-real-exam-close>ปิด</button></div>';
      return;
    }

    if(a.status==='draft' && realExamIndex===n){
      modalBody.innerHTML=realExamTimerHeader()+
        '<div class="practice-complete real-exam-complete"><span class="eyebrow">EXAM SUMMARY</span><h3>'+(realExamSaved.size===n?'ตอบครบทุกข้อแล้ว':'ยังเหลือ '+(n-realExamSaved.size)+' ข้อ')+'</h3>'+
        '<p>'+(s.allow_submit_early?'สามารถส่งข้อสอบก่อนหมดเวลาได้':'รอจนหมดเวลา ระบบจะส่งข้อสอบอัตโนมัติ')+'</p>'+
        (s.allow_submit_early?'<button type="button" class="practice-primary" data-real-exam-submit>ส่งข้อสอบ</button>':'')+
        (realExamSaved.size<n?'<button type="button" class="secondary" data-real-exam-unanswered>ไปข้อที่ยังไม่ตอบ</button>':'')+
        '<button type="button" class="secondary" data-real-exam-index="0">กลับข้อแรก</button></div>'+realExamGrid();
      updateRealExamClock(); return;
    }

    const q=realExam.questions[Math.max(0,realExamIndex)];
    if(!q){modalBody.innerHTML='<p class="practice-inline-error">ไม่พบข้อสอบในรอบนี้</p>';return;}
    const answer=realExamSaved.get(q.question_id), selected=realExamChoices.get(q.question_id);
    const review=realExam.can_review
      ? '<section class="practice-explanation"><span class="eyebrow">REVIEW & LEARN</span>'+realExamAnswerKey(q)+'<h4>วิธีทำ / การพิจารณา</h4><p>'+esc(q.explanation||'')+'</p><h4>เหตุผลและจุดที่ควรระวัง</h4><p>'+esc(q.reasoning||'')+'</p></section>'
      : '';
    const subjectLine=s.subject_id==='ALL'?subjectName(q.subject_id)+' · ':'';
    const savedBadge=answer?'<span class="practice-badge '+(realExam.can_review?(answer.is_correct?'correct':'incorrect'):'answered')+'">'+(realExam.can_review?(answer.is_correct?'✓ ตอบถูก':'ควรทบทวน'):'✓ บันทึกแล้ว')+'</span>':'';
    const canNext=a.status!=='draft'||realExamHasResponse(q,selected);
    modalBody.innerHTML=realExamTimerHeader()+
      '<div class="practice-question-heading"><span>ข้อ '+(Math.max(0,realExamIndex)+1)+' / '+n+' · '+esc(subjectLine+topicName(q.topic_id))+'</span>'+savedBadge+'<h3>'+(q.question_no?'ข้อ '+esc(q.question_no):'ข้อ '+(Math.max(0,realExamIndex)+1))+'</h3></div>'+
      '<p class="practice-prompt">'+esc(q.prompt)+'</p>'+
      (q.question_image_url?'<figure class="practice-source-figure"><img src="'+esc(freshQuestionImage(q.question_image_url))+'" alt="ภาพประกอบข้อ '+esc(q.question_no||realExamIndex+1)+'" loading="lazy"><figcaption>ภาพประกอบจากข้อสอบต้นฉบับ</figcaption></figure>':'')+
      realExamControl(q,selected)+
      '<p class="practice-save-status" role="status">'+(a.status==='draft'?'ระบบบันทึกคำตอบระหว่างทำ · เวลายังคงเดินต่อเนื่อง':'ข้อสอบถูกล็อกแล้ว')+'</p>'+
      '<div class="practice-navigation"><button type="button" class="secondary" data-real-exam-back '+(realExamSubmitting||realExamIndex===0?'disabled':'')+'>← ย้อน</button>'+
      (a.status==='draft'?'<button type="button" class="secondary" data-real-exam-skip>ข้าม →</button>':'')+
      '<button type="button" class="practice-primary" data-real-exam-next '+(!canNext||realExamSubmitting?'disabled':'')+'>'+(realExamIndex===n-1?'สรุปข้อสอบ':'ยืนยันและไปข้อต่อไป →')+'</button></div>'+
      (a.status==='submitted'?'<button type="button" class="secondary" data-real-exam-summary>กลับสรุปคะแนน</button>':'')+
      review+understandingMarkup(realExam,q,'exam',Boolean(realExam.staff_review))+learningMarkup(realExam,q,'exam')+realExamGrid();
    updateLearningHeading(realExam,q,'exam');
    updateRealExamClock();
  }

  async function saveRealExamResponse(q,value) {
    if(!realExam||realExam.attempt.status!=='draft'||realExamSubmitting||!realExamHasResponse(q,value)) return false;
    const previous=realExamResponseOf(realExamSaved.get(q.question_id));
    if(JSON.stringify(previous)===JSON.stringify(value)) return true;
    realExamSubmitting=true;
    try{
      const result=await post('exam-save',{exam_attempt_id:realExam.attempt.exam_attempt_id,question_id:q.question_id,response:value});
      const stored={question_id:q.question_id,response:result.item.response??value};
      if(q.response_mode==='choice') stored.selected_answer=Number(value);
      realExamSaved.set(q.question_id,stored);
      return true;
    }catch(error){
      notice(error.message);
      if(error.status===408) await submitRealExam(true);
      return false;
    }finally{
      realExamSubmitting=false;
      if(realExam) renderRealExam();
    }
  }

  async function moveRealExam(to,skip=false) {
    if(!realExam||realExamSubmitting) return;
    if(realExam.attempt.status==='draft' && realExamIndex>=0 && realExamIndex<realExam.questions.length && !skip){
      const q=realExam.questions[realExamIndex], value=realExamChoices.get(q.question_id);
      if(realExamHasResponse(q,value) && !await saveRealExamResponse(q,value)) return;
    }
    realExamIndex=Math.max(0,Math.min(to,realExam.questions.length));
    if(realExam.attempt.status==='submitted'&&realExamIndex===realExam.questions.length) realExamIndex=-1;
    renderRealExam(); modal.scrollTop=0;
  }

  async function submitRealExam(timeout=false) {
    if(!realExam||realExam.attempt.status!=='draft'||realExamSubmitting) return;
    if(!timeout){
      if(realExam.exam_session.require_all_answers&&realExamSaved.size<realExam.questions.length){
        notice('รอบสอบนี้กำหนดให้ตอบครบทุกข้อก่อนส่ง'); return;
      }
      if(!confirm('ยืนยันส่งข้อสอบ? หลังส่งแล้วจะกลับมาแก้คำตอบไม่ได้')) return;
    }
    realExamSubmitting=true;
    clearInterval(realExamTimer); realExamTimer=null;
    try{
      const result=await post('exam-submit',{exam_attempt_id:realExam.attempt.exam_attempt_id,timeout});
      await loadRealExam(result);
      notice(timeout?'หมดเวลา · ระบบส่งข้อสอบอัตโนมัติแล้ว':'ส่งข้อสอบเรียบร้อย');
      examSessionsData=await api(apiPath+'?route=exam-sessions').catch(()=>examSessionsData);
      renderPanel();
    }catch(error){
      notice(error.message);
      realExamSubmitting=false;
      startRealExamTimer(); renderRealExam();
    }
  }

  async function openSubject(sid, topicId, otherAttempt, set = selectedSet) {
    if (busy) return;
    learningView = false;
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
      await attachUnderstanding(result, 'practice');
      await attachLearning(result, Boolean(otherAttempt));
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
    modalBody.innerHTML = `${header}<div class="practice-question-heading"><span>${index + 1} / ${n} · ${esc(q.topic_id)}</span>${answer ? `<span class="practice-badge ${status === 'graded' ? answer.is_correct ? 'correct' : 'incorrect' : 'answered'}">${status === 'graded' ? answer.is_correct ? '✓ ตอบถูก' : 'ควรทบทวน' : '✓ บันทึกแล้ว'}</span>` : ''}<h3>${esc(topicName(q.topic_id))}</h3></div><p class="practice-prompt">${esc(q.prompt)}</p>${q.question_image_url ? `<figure class="practice-source-figure"><img src="${esc(freshQuestionImage(q.question_image_url))}" alt="ภาพประกอบข้อ ${esc(q.question_no || index + 1)}" loading="lazy"><figcaption>ภาพประกอบจากข้อสอบต้นฉบับ${q.question_no ? ` · ข้อ ${esc(q.question_no)}` : ''}</figcaption></figure>` : ''}${responseControl(q,selected)}<p class="practice-save-status" role="status">${busy ? 'กำลังบันทึกคำตอบ…' : editable() ? q.response_mode==='numeric' ? 'กรอกคำตอบแล้วกดยืนยันเพื่อบันทึกและไปข้อต่อไป' : q.response_mode==='complex' ? 'ตอบ ใช่ / ไม่ใช่ ให้ครบทุกข้อความ แล้วระบบจะบันทึกให้' : 'เลือกคำตอบแล้วระบบบันทึกให้ · กดยืนยันเพื่อไปข้อต่อไป' : status === 'submitted' ? 'ส่งแล้ว · คำตอบถูกล็อกระหว่างรอตรวจ' : status === 'graded' ? 'ดูคำตอบที่บันทึกและเฉลยด้านล่าง' : 'มุมมองครู · ดูโจทย์และเฉลยได้'}</p>${error}<div class="practice-navigation"><button type="button" class="secondary" data-back ${busy || index === 0 ? 'disabled' : ''}>← ย้อน</button>${editable() ? `<button type="button" class="secondary" data-skip ${busy ? 'disabled' : ''}>ข้าม →</button><button type="button" class="practice-primary" data-next ${busy || !canNext ? 'disabled' : ''}>${index === n - 1 ? 'ยืนยันคำตอบและสรุปวิชา' : 'ยืนยันคำตอบและไปข้อต่อไป →'}</button>` : `<button type="button" class="practice-primary" data-next ${busy ? 'disabled' : ''}>${index === n - 1 ? 'สรุปวิชา' : 'ข้อถัดไป →'}</button>`}</div>${explanation}${understandingMarkup(session,q,'practice',viewingOther)}${learningMarkup(session,q,'practice')}${questionGrid()}${viewingOther && data.member.can_manage && status === 'submitted' ? `<div class="practice-grade-action"><p>ตรวจอัตโนมัติตามเฉลยและเปิดผลให้นักเรียนพร้อมกัน</p><button type="button" class="practice-primary" data-grade="${esc(a.attempt_id)}" ${busy ? 'disabled' : ''}>ตรวจและเปิดผล</button></div>` : ''}`;
    updateLearningHeading(session, q, 'practice');
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
    if (busy || realExamSubmitting) return;
    if (realExam) {
      if (realExam.attempt?.status==='draft' && !realExam.exam_session?.allow_resume) {
        notice('รอบสอบนี้ไม่อนุญาตให้ออกจากหน้าสอบก่อนส่งหรือหมดเวลา');
        return;
      }
      if (realExam.attempt?.status==='draft' && realExamIndex>=0 && realExamIndex<realExam.questions.length) {
        const q=realExam.questions[realExamIndex], value=realExamChoices.get(q.question_id);
        if (realExamHasResponse(q,value) && !await saveRealExamResponse(q,value)) return;
      }
      clearInterval(realExamTimer); realExamTimer=null; realExam=null;
      requestNo++; modal.close(); returnView=null; understandingReturn=false;
      return;
    }
    if (session && editable()) {
      const q = session.questions[index], value = q && choices.get(q.question_id);
      if (q && hasResponse(q,value) && !await saveResponse(q, value)) return;
    }
    requestNo++; modal.close(); session = null; returnView = null; understandingReturn=false;
  }
  async function updateSubject() {
    learningView = false;
    if (!session || busy) return;
    busy = true; const previousIndex = index;
    try {
      session = await api(`${apiPath}?route=subject&set_no=${session.set_no}&subject_id=${session.subject_id}${viewingOther ? `&attempt_id=${session.attempt.attempt_id}` : ''}`);
      await attachUnderstanding(session, 'practice');
      await attachLearning(session, viewingOther);
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

  function examScores(attempts) {
    const latest=new Map();
    for(const a of attempts.filter(x=>x.status==='submitted')) {
      if(!latest.has(a.session_id)||Number(a.attempt_no)>Number(latest.get(a.session_id).attempt_no)) latest.set(a.session_id,a);
    }
    return {correct:[...latest.values()].reduce((n,a)=>n+Number(a.correct_count),0),
      total:[...latest.values()].reduce((n,a)=>n+Number(a.total_count),0),
      completed:latest.size,submitted:attempts.filter(a=>a.status==='submitted').length,drafts:attempts.filter(a=>a.status==='draft').length};
  }

  function reportAttempts(student) {
    return (student.attempts||[]).filter(a=>!resultsSessionId||a.session_id===resultsSessionId);
  }

  function realExamSubjectTable() {
    const scores=realExam?.subject_scores||[];
    if(!scores.length) return '';
    return '<div class="exam-subject-scores"><h4>คะแนนรายวิชา</h4><div class="exam-score-table-wrap"><table><thead><tr><th scope="col">วิชา</th><th scope="col">ถูก / ทั้งหมด</th><th scope="col">ตอบแล้ว</th><th scope="col">ความถูกต้อง</th></tr></thead><tbody>'+scores.map(r=>
      '<tr><th scope="row">'+esc(subjectName(r.subject_id))+'</th><td>'+esc(r.correct_count)+' / '+esc(r.total_count)+'</td><td>'+esc(r.answered_count)+' / '+esc(r.total_count)+'</td><td>'+pct(r.correct_count,r.total_count)+'</td></tr>'
    ).join('')+'</tbody></table></div><p class="practice-muted">คิดจากทุกข้อในวิชานั้น รวมข้อที่ไม่ได้ตอบ</p></div>';
  }

  function reportModeButtons() {
    return '<nav class="practice-result-tabs" aria-label="รูปแบบผลสอบ"><button type="button" class="tab '+(resultsMode==='exam'?'active':'')+'" data-results-mode="exam" aria-pressed="'+(resultsMode==='exam')+'">สอบจริง</button><button type="button" class="tab '+(resultsMode==='practice'?'active':'')+'" data-results-mode="practice" aria-pressed="'+(resultsMode==='practice')+'">ชุดฝึก</button></nav>';
  }

  function renderExamResultsList() {
    const query=resultsQuery.trim().toLocaleLowerCase('th');
    const students=staffResults.students.filter(s=>{
      if(query&&!`${s.member_name} ${s.member_id}`.toLocaleLowerCase('th').includes(query)) return false;
      const attempts=reportAttempts(s);
      if(resultsSessionId&&!attempts.length) return false;
      return resultsFilter==='all'||(resultsFilter==='not_started'?!attempts.length:attempts.some(a=>a.status===resultsFilter));
    }).sort((a,b)=>a.member_name.localeCompare(b.member_name,'th'));
    modalBody.querySelector('#practice-results-count').textContent='พบ '+students.length+' จาก '+staffResults.students.length+' คน';
    modalBody.querySelector('#practice-results-list').innerHTML=students.length?students.map(student=>{
      const r=examScores(reportAttempts(student));
      return `<article class="practice-student-row"><div class="practice-student-name"><strong>${esc(student.member_name)}</strong><small>รหัสสมาชิก ${esc(student.member_id)}</small>${!student.is_active?'<span class="practice-badge incorrect">ถอนสิทธิ์แล้ว · เก็บประวัติผลสอบ</span>':''}<span>${r.submitted||r.drafts?'ส่งแล้ว '+r.submitted+' ครั้ง · กำลังสอบ '+r.drafts:'ยังไม่เริ่มสอบจริงในชุดนี้'}</span></div><div class="practice-student-score"><strong>${pct(r.correct,r.total)}</strong><small>${r.total?'ถูก '+r.correct+' / '+r.total+' ข้อ':'ยังไม่มีผลสอบจริง'}</small></div><button type="button" class="secondary" data-student-id="${esc(student.member_id)}">ดูผลสอบรายคน ↗</button></article>`;
    }).join(''):'<div class="empty">ไม่พบผู้สอบที่ตรงกับคำค้นหรือสถานะที่เลือก</div>';
  }

  function renderExamResults() {
    session=null;realExam=null;viewingOther=false;returnView=null;staffStudentId=null;
    document.querySelector('#practice-title').textContent='ผลสอบจริงนักเรียนรายคน';
    const all=examScores(staffResults.students.flatMap(s=>reportAttempts(s).map(a=>({...a,session_id:s.member_id+'/'+a.session_id}))));
    modalBody.innerHTML=resultsToolbar()+
      (staffResults.exam_error?'<p class="practice-inline-error" role="alert">'+esc(staffResults.exam_error)+'</p>':'')+
      '<p class="practice-muted">คะแนนสอบจริง · คะแนนรวมใช้ครั้งล่าสุดที่ส่งแล้วของแต่ละรอบ · ไม่รวมคะแนนชุดฝึก</p>'+
      '<div class="practice-report-stats"><span><b>'+staffResults.students.filter(s=>reportAttempts(s).length).length+'</b> นักเรียนเข้าสอบ</span><span><b>'+all.submitted+'</b> ครั้งที่ส่งแล้ว</span><span><b>'+all.drafts+'</b> ครั้งที่กำลังสอบ</span></div>'+
      '<div class="practice-report-filters"><input type="search" id="practice-results-search" aria-label="ค้นหาผู้สอบ" placeholder="ค้นหาชื่อนักเรียนหรือรหัสสมาชิก…" value="'+esc(resultsQuery)+'"><select id="practice-results-status" aria-label="กรองสถานะสอบจริง">'+[['all','ทุกสถานะ'],['submitted','สอบเสร็จแล้ว'],['draft','กำลังสอบ'],['not_started','ยังไม่เริ่มสอบ']].map(([value,label])=>'<option value="'+value+'" '+(resultsFilter===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div><p id="practice-results-count" class="practice-muted" role="status" aria-live="polite"></p><div id="practice-results-list"></div>';
    renderExamResultsList();modal.scrollTop=0;
  }

  function renderStudentExamResult(id) {
    const student=staffResults.students.find(s=>s.member_id===id);
    if(!student){renderResults();return;}
    session=null;realExam=null;viewingOther=false;returnView=null;staffStudentId=id;
    const attempts=reportAttempts(student).slice().sort((a,b)=>String(b.started_at||'').localeCompare(String(a.started_at||''))||Number(b.attempt_no)-Number(a.attempt_no));
    const r=examScores(attempts);
    document.querySelector('#practice-title').textContent=student.member_name+' · ผลสอบจริง';
    modalBody.innerHTML='<button type="button" class="secondary" data-results-list>← รายชื่อนักเรียน</button><button type="button" class="secondary" data-learning-student="'+esc(id)+'">สถานะหัวข้อเรียน</button>'+resultsToolbar()+
      `<div class="practice-student-overview"><div><span class="eyebrow">REAL EXAM RESULTS</span><h3>${esc(student.member_name)}</h3><small>รหัสสมาชิก ${esc(student.member_id)}${student.is_active?'':' · ถอนสิทธิ์แล้ว'}</small><p>ส่งแล้ว ${r.submitted} ครั้ง · กำลังสอบ ${r.drafts}</p></div><div class="practice-student-score"><strong>${pct(r.correct,r.total)}</strong><small>${r.total?'ถูก '+r.correct+' / '+r.total+' ข้อ':'ยังไม่มีผลสอบจริง'}</small></div></div>`+
      '<p class="practice-muted">คะแนนรวมใช้ครั้งล่าสุดที่ส่งแล้วของแต่ละรอบ · เปิดดูประวัติทุกครั้งได้ด้านล่าง</p>'+
      '<div class="practice-student-subjects">'+(attempts.length?attempts.map(a=>
        `<article class="practice-student-subject"><div><h4>${esc(a.title)}</h4><span class="practice-badge ${a.status==='submitted'?'correct':'answered'}">${a.status==='submitted'?'สอบเสร็จแล้ว':'กำลังสอบ'} · ครั้งที่ ${esc(a.attempt_no)}</span><small>${esc(subjectName(a.subject_id))} · ชุด ${esc(a.set_no)}</small><p>${a.status==='submitted'?'<b>'+pct(a.correct_count,a.total_count)+'</b> · ถูก '+a.correct_count+' / '+a.total_count+' ข้อ':a.total_count+' ข้อ · ยังไม่ส่งข้อสอบ'}</p><small>เริ่ม ${esc(date(a.started_at))}</small>${a.submitted_at?'<small>ส่ง '+esc(date(a.submitted_at))+(a.timed_out?' · หมดเวลาและส่งอัตโนมัติ':'')+'</small>':''}<small>${a.status==='submitted'?(a.result_visible?'เปิดคะแนนให้นักเรียนแล้ว':'ยังไม่เปิดคะแนนให้นักเรียน'):''}</small></div><div class="practice-report-actions">${a.status==='submitted'?'<button type="button" class="practice-primary" data-exam-review-attempt="'+esc(a.exam_attempt_id)+'">ดูคะแนนรายวิชา / คำตอบ</button>':''}</div></article>`
      ).join(''):'<div class="empty">นักเรียนยังไม่เริ่มสอบจริงในชุดนี้</div>')+'</div>';
    modal.scrollTop=0;
  }

  function switchResultsMode(mode) {
    if(!['practice','exam'].includes(mode)) return;
    const id=staffStudentId;
    resultsMode=mode;resultsFilter='all';resultsSessionId='';
    staffResults=mode==='exam'?staffExamResults:staffPracticeResults;
    if(id) renderStudentResult(id);else renderResults();
  }

  async function openExamReview(id) {
    learningView = false;
    if(busy||!canSeeResults()) return;
    const ticket=++requestNo;
    understandingReturn=false;
    examReportReturn={set_no:staffResults.set_no,member_id:staffStudentId};
    busy=true;document.querySelector('#practice-close').disabled=true;
    modalBody.innerHTML='<p class="practice-muted" role="status">กำลังเปิดคะแนนและคำตอบสอบจริง…</p>';
    try{
      const result=await api(apiPath+'?route=exam-review&exam_attempt_id='+encodeURIComponent(id));
      if(!modal.open||ticket!==requestNo) return;
      await loadRealExam(result);modal.scrollTop=0;
    }catch(error){
      if(modal.open&&ticket===requestNo) modalBody.innerHTML='<p class="practice-inline-error" role="alert">'+esc(error.message)+'</p><button type="button" class="secondary" data-exam-review-back>← ผลสอบรายคน</button>';
    }finally{busy=false;document.querySelector('#practice-close').disabled=false;}
  }

  function resultsToolbar() {
    const sessionFilter=resultsMode==='exam'?'<label class="practice-set-label">รอบสอบ <select id="exam-results-session"><option value="">ทุกรอบสอบ</option>'+staffResults.sessions.map(s=>'<option value="'+esc(s.session_id)+'" '+(s.session_id===resultsSessionId?'selected':'')+'>'+esc(s.title)+'</option>').join('')+'</select></label>':'';
    return reportModeButtons()+`<div class="practice-report-toolbar"><label class="practice-set-label">${resultsMode==='exam'?'ชุดข้อสอบ':'ชุดฝึก'} <select id="practice-results-set">${staffResults.sets.map(s => `<option value="${s.set_no}" ${s.set_no === staffResults.set_no ? 'selected' : ''}>${esc(setLabel(s) || '—')}${s.is_active ? '' : ' · ปิดแล้ว'}</option>`).join('')}</select></label>${sessionFilter}<button type="button" class="secondary" data-results-refresh>อัปเดตผลรายคน</button>${resultsMode==='exam'?'<button type="button" class="secondary" data-exam-manage>จัดการรอบสอบ</button>':''}</div>`;
  }

  function renderResultsList() {
    if(resultsMode==='exam') {renderExamResultsList();return;}
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
    if(resultsMode==='exam') {renderExamResults();return;}
    session = null; viewingOther = false; returnView = null; staffStudentId = null;
    document.querySelector('#practice-title').textContent = 'ผลตรวจนักเรียนรายคน';
    const all = scores(staffResults.students.flatMap(s => s.attempts));
    modalBody.innerHTML = `${resultsToolbar()}<p class="practice-muted">เลือกนักเรียนเพื่อดูคะแนนแต่ละวิชาและคำตอบรายข้อ · เปอร์เซ็นต์รวมใช้เฉพาะข้อที่ตรวจแล้ว</p><div class="practice-report-stats"><span><b>${staffResults.students.length}</b> นักเรียน</span><span><b>${all.graded}</b> วิชาตรวจแล้ว</span><span><b>${all.pending}</b> วิชารอตรวจ</span></div><div class="practice-report-filters"><input type="search" id="practice-results-search" aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อนักเรียนหรือรหัสสมาชิก…" value="${esc(resultsQuery)}"><select id="practice-results-status" aria-label="กรองผลตรวจนักเรียน">${[['all','ทุกสถานะ'],['graded','มีผลตรวจแล้ว'],['submitted','มีคำตอบรอตรวจ'],['draft','กำลังทำ'],['not_started','ยังไม่เริ่ม']].map(([value,label]) => `<option value="${value}" ${value === resultsFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p id="practice-results-count" class="practice-muted" role="status" aria-live="polite"></p><div id="practice-results-list"></div>`;
    renderResultsList(); modal.scrollTop = 0;
  }

  function renderStudentResult(id) {
    if(resultsMode==='exam') {renderStudentExamResult(id);return;}
    const student = staffResults.students.find(s => s.member_id === id);
    if (!student) { renderResults(); return; }
    session = null; viewingOther = false; returnView = null; staffStudentId = id;
    document.querySelector('#practice-title').textContent = `${student.member_name} · ผลตรวจ`;
    const r = scores(student.attempts);
    const subjects = data.subjects.filter(s => staffResults.counts.some(c => c.subject_id === s.subject_id));
    modalBody.innerHTML = `<button type="button" class="secondary" data-results-list>← รายชื่อนักเรียน</button><button type="button" class="secondary" data-learning-student="${esc(id)}">สถานะหัวข้อเรียน</button>${resultsToolbar()}<div class="practice-student-overview"><div><span class="eyebrow">STUDENT RESULTS</span><h3>${esc(student.member_name)}</h3><small>รหัสสมาชิก ${esc(student.member_id)}${student.is_active ? '' : ' · ถอนสิทธิ์แล้ว'}</small><p>ตรวจแล้ว ${r.graded} / ${subjects.length} วิชา · รอตรวจ ${r.pending} · กำลังทำ ${r.drafts}</p></div><div class="practice-student-score"><strong>${pct(r.correct, r.total)}</strong><small>${r.total ? `ถูก ${r.correct} / ${r.total} ข้อที่ตรวจแล้ว` : 'ยังไม่มีผลตรวจ'}</small></div></div><p class="practice-muted">ความถูกต้องรวม = ข้อที่ถูก ÷ ข้อที่ตรวจแล้วทั้งหมด · วิชาที่ยังไม่ตรวจยังไม่รวมในคะแนน</p><div class="practice-student-subjects">${subjects.map(s => {
      const a = student.attempts.find(x => x.subject_id === s.subject_id);
      const count = staffResults.counts.find(c => c.subject_id === s.subject_id).total_count;
      return `<article class="practice-student-subject"><div><h4>${esc(s.subject_name_th)}</h4><span class="practice-badge ${a?.status === 'graded' ? 'correct' : a?.status === 'submitted' ? 'incorrect' : ''}">${a ? stateLabel[a.status] : 'ยังไม่เริ่ม'}</span><p>${a?.status === 'graded' ? `<b>${pct(a.correct_count, a.total_count)}</b> · ถูก ${a.correct_count} / ${a.total_count} ข้อ` : `${a?.total_count || count} ข้อ · ยังไม่มีคะแนน`}</p>${a?.submitted_at ? `<small>ส่ง ${esc(date(a.submitted_at))}</small>` : ''}${a?.status === 'graded' ? `<small>ตรวจโดย ${esc(a.graded_by_name || '—')}</small><small>ตรวจ ${esc(date(a.graded_at))}</small>` : ''}</div><div class="practice-report-actions">${a && (a.status === 'graded' || a.status === 'submitted' && data.member.can_manage) ? `<button type="button" class="secondary" data-result-attempt="${esc(a.attempt_id)}" data-result-subject="${esc(s.subject_id)}">${a.status === 'graded' ? 'ดูคำตอบ / เฉลยรายข้อ' : 'ดูคำตอบ'}</button>` : ''}${a?.status === 'submitted' && data.member.can_manage ? `<button type="button" class="practice-primary" data-grade="${esc(a.attempt_id)}">ตรวจและเปิดผล</button>` : ''}</div></article>`;
    }).join('') || '<div class="empty">กำลังเตรียมโจทย์สำหรับชุดนี้</div>'}</div>`;
    modal.scrollTop = 0;
  }

  async function openResults(set = selectedSet, studentId = null, mode = resultsMode, sessionId = resultsSessionId) {
    learningView = false;
    if (busy || !canSeeResults()) return;
    const ticket = ++requestNo;
    busy = true; session = null; realExam=null; returnView = null;
    clearInterval(realExamTimer);realExamTimer=null;
    document.querySelector('#practice-title').textContent = 'ผลตรวจนักเรียนรายคน';
    document.querySelector('#practice-close').disabled = true;
    modalBody.innerHTML = '<p class="practice-muted" role="status">กำลังเปิดผลตรวจรายคน…</p>';
    if (!modal.open) modal.showModal();
    try {
      const [practiceReport,examReport]=await Promise.all([
        api(`${apiPath}?route=results&set_no=${set}`),
        api(`${apiPath}?route=exam-results&set_no=${set}`).catch(error=>({set_no:set,sets:[],sessions:[],students:[],exam_error:error.message}))
      ]);
      if (!modal.open || ticket !== requestNo) return;
      staffPracticeResults=practiceReport;staffExamResults={...examReport,sets:practiceReport.sets};
      resultsMode=mode||(examReport.students.some(s=>s.attempts.length)?'exam':'practice');
      resultsSessionId=examReport.sessions.some(s=>s.session_id===sessionId)?sessionId:'';
      staffResults=resultsMode==='exam'?staffExamResults:staffPracticeResults;
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
    else if (target.dataset.realExamSession) openRealExamIntro(target.dataset.realExamSession);
    else if (target.hasAttribute('data-exam-manage')) openExamManager();
    else if (target.hasAttribute('data-understanding-list')) { understandingFilter = 'needs_help'; understandingQuery = ''; openUnderstandingList(); }
    else if (target.hasAttribute('data-learning-report')) openLearningReport();
    else if (target.hasAttribute('data-learning-refresh')) refreshLearning().then(() => { rerender(); renderPanel(); });
    else if (target.hasAttribute('data-review')) openReview();
    else if (target.dataset.resultSubject) { resultSubject = target.dataset.resultSubject; renderPanel(); }
  };
  const setChange = event => {
    if (event.target.id === 'learning-member') { selectLearningMember(event.target.value); return; }
    if (event.target.id === 'practice-set') { selectedSet = Number(event.target.value); renderPanel(); rerender(); }
  };
  const modalClick = event => {
    const t = event.target.closest('button'); if (!t || busy) return;
    if (t.hasAttribute('data-learning-report')) openLearningReport();
    else if (t.dataset.learningStudent) openLearningReport(t.dataset.learningStudent);
    else if (t.hasAttribute('data-learning-update')) updateLearningReport();
    else if (t.dataset.learningRetry) {
      const paper = t.dataset.learningRetry === 'exam' ? realExam : session;
      if (paper) attachLearning(paper, Boolean(paper.staff_review || viewingOther)).then(() => updateLearningHeading(paper, paper.questions[t.dataset.learningRetry === 'exam' ? realExamIndex : index], t.dataset.learningRetry));
    }
    else if (t.hasAttribute('data-understanding-list')) openUnderstandingList();
    else if (t.dataset.understandingOpen !== undefined) openUnderstandingQuestion(Number(t.dataset.understandingOpen));
    else if (t.dataset.understandingStatus) saveUnderstandingStatus(t.dataset.understandingStatus, t.dataset.understandingMode);
    else if (t.dataset.understandingReload) reloadUnderstanding(t.dataset.understandingReload);
    else if (t.dataset.resultsMode) switchResultsMode(t.dataset.resultsMode);
    else if (t.dataset.examResults) {const s=(examSessionsData?.sessions||[]).find(x=>x.session_id===t.dataset.examResults);if(s){resultsFilter='all';openResults(s.set_no,null,'exam',s.session_id);}}
    else if (t.dataset.examReviewAttempt) openExamReview(t.dataset.examReviewAttempt);
    else if (t.hasAttribute('data-exam-review-back')&&examReportReturn) openResults(examReportReturn.set_no,examReportReturn.member_id,'exam');
    else if (t.hasAttribute('data-real-exam-summary')) {realExamIndex=-1;renderRealExam();modal.scrollTop=0;}
    else if (t.dataset.realExamStart) beginRealExam(t.dataset.realExamStart);
    else if (t.dataset.realExamIndex !== undefined) { realExamIndex=Number(t.dataset.realExamIndex); renderRealExam(); modal.scrollTop=0; }
    else if (t.hasAttribute('data-real-exam-back')) moveRealExam(realExamIndex-1);
    else if (t.hasAttribute('data-real-exam-next')) moveRealExam(realExamIndex+1);
    else if (t.hasAttribute('data-real-exam-skip')) moveRealExam(realExamIndex+1,true);
    else if (t.hasAttribute('data-real-exam-unanswered')) { const i=realExam.questions.findIndex(q=>!realExamSaved.has(q.question_id)); if(i>=0){realExamIndex=i;renderRealExam();modal.scrollTop=0;} }
    else if (t.hasAttribute('data-real-exam-submit')) submitRealExam(false);
    else if (t.hasAttribute('data-real-exam-review')) { realExamIndex=0; renderRealExam(); modal.scrollTop=0; }
    else if (t.hasAttribute('data-real-exam-close')) closeModal();
    else if (t.dataset.questionIndex !== undefined) move(Number(t.dataset.questionIndex));
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
    else if (t.hasAttribute('data-exam-manage')) openExamManager();
    else if (t.hasAttribute('data-exam-list')) renderExamManager();
    else if (t.hasAttribute('data-exam-new')) renderExamForm();
    else if (t.dataset.examEdit) renderExamForm((examSessionsData?.sessions||[]).find(x=>x.session_id===t.dataset.examEdit));
    else if (t.dataset.examMembers) openExamMembers(t.dataset.examMembers);
    else if (t.dataset.examDelete) deleteExamSession(t.dataset.examDelete);
    else if (t.dataset.examReleaseResults) releaseExamResults(t.dataset.examReleaseResults,false);
    else if (t.dataset.examReleaseAnswers) releaseExamResults(t.dataset.examReleaseAnswers,true);
    else if (t.hasAttribute('data-exam-save')) saveExamForm();
    else if (t.hasAttribute('data-exam-members-save')) saveExamMembers();
    else if (t.hasAttribute('data-exam-select-all')) { const boxes=[...modalBody.querySelectorAll('[data-exam-member]')].filter(x=>x.closest('.exam-member-row')?.style.display!=='none'); const should=boxes.some(x=>!x.checked); boxes.forEach(x=>x.checked=should); t.textContent=should?'ยกเลิกทั้งหมด':'เลือกทั้งหมด'; }
    else if (t.dataset.grade) grade(t.dataset.grade, t);
  };
  const choiceChange = event => {
    if (event.target.dataset.learningStatus) { changeLearning(event.target.dataset.learningStatus, event.target.value); return; }
    if (event.target.id === 'learning-status-filter') { learningFilter = event.target.value; renderLearningRows(); return; }
    if (event.target.id === 'learning-subject-filter') { learningSubject = event.target.value; renderLearningRows(); return; }
    if (event.target.id === 'understanding-filter') { understandingFilter = event.target.value; renderUnderstandingRows(); return; }
    if (event.target.id === 'practice-results-set') { openResults(Number(event.target.value), staffStudentId,resultsMode,''); return; }
    if (event.target.id === 'exam-results-session') {resultsSessionId=event.target.value;if(staffStudentId)renderStudentResult(staffStudentId);else renderResults();return;}
    if (realExam && realExam.attempt?.status==='draft' && event.target.name === 'real-exam-choice') { const q=realExam.questions[realExamIndex], value=Number(event.target.value); realExamChoices.set(q.question_id,value); saveRealExamResponse(q,value); return; }
    if (realExam && realExam.attempt?.status==='draft' && event.target.dataset.realExamPart) { const q=realExam.questions[realExamIndex], current=realExamChoices.get(q.question_id); const value=current&&typeof current==='object'&&!Array.isArray(current)?{...current}:{}; value[event.target.dataset.realExamPart]=Number(event.target.value); realExamChoices.set(q.question_id,value); if(realExamHasResponse(q,value)) saveRealExamResponse(q,value); else renderRealExam(); return; }
    if (realExam && realExam.attempt?.status==='draft' && event.target.id === 'real-exam-numeric') { const q=realExam.questions[realExamIndex]; realExamChoices.set(q.question_id,event.target.value); if(realExamHasResponse(q,event.target.value)) saveRealExamResponse(q,event.target.value); return; }
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
    if (event.target.id === 'learning-roster-search') { learningQuery = event.target.value; renderLearningRosterRows(); return; }
    if (event.target.id === 'learning-topic-search') { learningQuery = event.target.value; renderLearningRows(); return; }
    if (event.target.id === 'understanding-search') { understandingQuery = event.target.value; renderUnderstandingRows(); return; }
    if (event.target.id === 'practice-results-search') { resultsQuery = event.target.value; renderResultsList(); return; }
    if (event.target.id === 'exam-member-search') { const q=event.target.value.trim().toLowerCase(); modalBody.querySelectorAll('.exam-member-row').forEach(row=>{row.style.display=!q||row.dataset.memberText.includes(q)?'':'none';}); return; }
    if (event.target.id === 'real-exam-numeric' && realExam?.attempt?.status==='draft' && realExamIndex>=0) { const q=realExam.questions[realExamIndex]; realExamChoices.set(q.question_id,event.target.value); return; }
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
  learningTimer = setInterval(() => {
    if (document.visibilityState === 'hidden' || busy || learningSaving) return;
    if (learningView && learningReport && modal.open) updateLearningReport();
    else if (!modal.open && (data.member.can_study || data.viewedStudent)) refreshLearning().then(() => { if (!disposed) { rerender(); renderPanel(); } });
  }, 30000);
  renderPanel();
  return { refresh, topicAction, openExamManager, beginLearningSave() {
    learningSaving = true; learningRequest++; learningReportRequest++;
  }, learningChanged() {
    learningSaving = false;
    for (const paper of [session, realExam]) if (paper?.learning?.can_edit) paper.learning.progress = data.progress;
    renderPanel();
  }, subjectChanged() { resultSubject = getSubject(); if (bank?.ready) renderPanel(); }, destroy() {
    disposed = true; clearInterval(learningTimer); learningRequest++; learningReportRequest++;
    requestNo++; main.removeEventListener('click', mainClick); main.removeEventListener('change', setChange);
    modalBody.removeEventListener('click', modalClick); modalBody.removeEventListener('change', choiceChange);
    modalBody.removeEventListener('input', resultsSearch);
    modal.removeEventListener('cancel', cancel); document.querySelector('#practice-close').removeEventListener('click', closeModal);
    clearInterval(realExamTimer); realExamTimer=null; realExam=null; modal.close(); session = null;
  } };
}

