import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import practice from '../api/practice.js';
import alevel from '../api/alevel.js';
import { COOKIE, signToken } from '../lib/school.js';

// Synthetic content only. The real set and its answer bank must stay out of this public repo.
function fixture() {
  const names = ['SUPABASE_URL','SUPABASE_SECRET_KEY','SCHOOL_BRIDGE_KEY'];
  const previous = Object.fromEntries(names.map(n => [n,process.env[n]]));
  process.env.SUPABASE_URL = 'https://practice-db.invalid';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fixture';
  process.env.SCHOOL_BRIDGE_KEY = 'practice_bridge_fixture';
  const originalFetch = globalThis.fetch, originalError = console.error;
  console.error = () => {};
  const members = [
    { member_id:'student', member_name:'นักเรียนสมมติ', is_active:true, can_study:true, can_teach:false, can_manage:false },
    { member_id:'teacher', member_name:'ครูสมมติ', is_active:true, can_study:false, can_teach:true, can_manage:false },
    { member_id:'manager', member_name:'ผู้ดูแลสมมติ', is_active:true, can_study:false, can_teach:false, can_manage:true }
  ];
  const rows = { school_members:members, school_practice_sets:[{set_no:1,label:'ชุดทดสอบ',is_active:true}],
    school_practice_questions:[1,2].map(i => ({question_id:`P01-ENG-01.0${i}`,topic_id:`ENG-01.0${i}`,set_no:1,subject_id:'ENG',sort_order:i,prompt:'Synthetic question',choices:['A','B','C','D','E'],answer_key:2,explanation:'teacher-only explanation',reasoning:'teacher-only reasoning',source_question_ids:[]})),
    school_practice_attempts:[], school_practice_answers:[] };
  const requests = []; let sourceActive = true, schemaMissing = false;
  let rpcReply = () => { throw new Error('Unconfigured fixture RPC'); };
  globalThis.fetch = async (input, options={}) => {
    const url = new URL(input), method = options.method || 'GET';
    if (url.hostname === 'watt.nathoeng.com') {
      const p = JSON.parse(options.body);
      const signature = crypto.createHmac('sha256',process.env.SCHOOL_BRIDGE_KEY).update(JSON.stringify(p)).digest('hex');
      assert.equal(options.headers['X-School-Signature'],signature);
      return new Response(JSON.stringify({success:true,is_active:sourceActive}));
    }
    assert.equal(url.hostname,'practice-db.invalid');
    requests.push({url,method,payload:options.body ? JSON.parse(options.body) : null});
    if (url.pathname.includes('/rpc/')) return new Response(JSON.stringify(rpcReply(url.pathname.split('/').pop(),JSON.parse(options.body))));
    const table = url.pathname.split('/').pop();
    if (schemaMissing && table.startsWith('school_practice_')) return new Response('{"code":"PGRST205"}',{status:404});
    assert.ok(rows[table],table);
    if(method==='PATCH'){
      const row=rows[table].find(r=>r.session_id===url.searchParams.get('session_id').slice(3));
      Object.assign(row,JSON.parse(options.body));
      return new Response(JSON.stringify([row]));
    }
    assert.equal(method,'GET');
    const reserved = new Set(['select','order','limit','offset']);
    let result = rows[table].filter(row => [...url.searchParams].every(([key,value]) => {
      if (reserved.has(key)) return true;
      if (value.startsWith('eq.')) return String(row[key])===value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4,-1).split(',').includes(String(row[key]));
      throw new Error('Unexpected filter '+value);
    }));
    const order=url.searchParams.get('order');
    if(order)result.sort((a,b)=>{
      for(const part of order.split(',')){
        const [field,direction]=part.split('.'),comparison=a[field]<b[field]?-1:a[field]>b[field]?1:0;
        if(comparison)return direction==='desc'?-comparison:comparison;
      }
      return 0;
    });
    result = result.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));
    const select = url.searchParams.get('select');
    if (select && select!=='*') result=result.map(row=>Object.fromEntries(select.split(',').filter(k=>k in row).map(k=>[k,row[k]])));
    return new Response(JSON.stringify(result));
  };
  async function call(route, actor='student', payload, query={}) {
    const now = Date.now(), cookie = actor ? `${COOKIE}=${signToken({memberId:actor,iat:now,exp:now+60000},'school-session')}` : '';
    const req = {method:payload===undefined?'GET':'POST',query:{route,...query},headers:{host:'school.nathoeng.com',origin:'https://school.nathoeng.com',cookie},body:payload};
    const result = {status:200,headers:{},body:null};
    const res = {setHeader(k,v){result.headers[k]=v;},status(n){result.status=n;return this;},json(value){result.body=value;return this;}};
    if (query.origin) req.headers.origin=query.origin;
    if (query.method) req.method=query.method;
    await (query.track==='alevel'?alevel:practice)(req,res); return result;
  }
  return {rows,requests,members,call,setRPC(fn){rpcReply=fn;},setSource(active){sourceActive=active;},setMissing(value){schemaMissing=value;},restore(){
    globalThis.fetch=originalFetch; console.error=originalError;
    for(const n of names) if(previous[n]===undefined) delete process.env[n];else process.env[n]=previous[n];
  }};
}

test('practice API keeps results private until a manager publishes them',async t=>{
  const f=fixture(), id=crypto.randomUUID();
  const attempt={attempt_id:id,member_id:'student',set_no:1,subject_id:'ENG',status:'draft',total_count:2,correct_count:999,submitted_at:null,graded_at:null,updated_at:new Date().toISOString()};
  try {
    await t.test('unauthenticated requests cannot read or write practice data',async()=>{
      assert.equal((await f.call('summary',null)).status,401);
      assert.equal((await f.call('grade',null,{attempt_id:id})).status,401);
      assert.equal(f.requests.length,0);
    });
    await t.test('start uses the cookie member and validated set, never client roles',async()=>{
      f.setRPC((name,p)=>{assert.equal(name,'school_practice_start');assert.deepEqual(p,{p_member_id:'student',p_set_no:1,p_subject_id:'ENG'});return attempt;});
      const r=await f.call('start','student',{member_id:'manager',can_manage:true,set_no:'1',subject_id:'ENG'});
      assert.equal(r.status,200);assert.equal(r.body.item.attempt_id,id);assert.equal('correct_count' in r.body.item,false);
      f.rows.school_practice_attempts.push(attempt);
    });
    await t.test('students get choices and their saved selections, with no keys or provisional correctness',async()=>{
      f.rows.school_practice_answers.push({attempt_id:id,question_id:'P01-ENG-01.01',selected_answer:1,is_correct:true});
      const r=await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG'});
      assert.equal(r.status,200);assert.equal(r.body.can_review,false);
      assert.equal(r.body.questions[0].choices.length,5);
      for(const q of r.body.questions) for(const field of ['answer_key','explanation','reasoning','source_question_ids']) assert.equal(field in q,false);
      assert.equal('is_correct' in r.body.answers[0],false);assert.equal('correct_count' in r.body.attempt,false);
      assert.equal(r.headers['Cache-Control'],'no-store');
      const summary=await f.call('summary');
      assert.equal(summary.body.ready,true);assert.equal('is_correct' in summary.body.answers[0],false);
      assert.equal(JSON.stringify(summary.body).includes('teacher-only'),false);
      assert.equal(summary.body.counts[0].total_count,2);
    });
    await t.test('next question follows chapter order when local sort numbers restart',async()=>{
      f.rows.school_practice_questions.push({...f.rows.school_practice_questions[0],question_id:'P01-ENG-02.01',topic_id:'ENG-02.01',sort_order:1});
      try{
        const r=await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG'});
        assert.equal(r.status,200);
        assert.deepEqual(r.body.questions.map(q=>q.topic_id),['ENG-01.01','ENG-01.02','ENG-02.01']);
      }finally{f.rows.school_practice_questions.pop();}
    });
    await t.test('teacher can preview explanations but cannot grade or see unpublished student answers',async()=>{
      const r=await f.call('subject','teacher',undefined,{set_no:1,subject_id:'ENG'});
      assert.equal(r.body.questions[0].answer_key,2);assert.equal(r.body.questions[0].explanation,'teacher-only explanation');
      assert.equal(r.body.attempt,null);
      assert.equal((await f.call('grade','teacher',{attempt_id:id})).status,403);
      assert.equal((await f.call('review','teacher')).status,403);
      assert.equal((await f.call('subject','teacher',undefined,{set_no:1,subject_id:'ENG',attempt_id:id})).status,403);
      assert.equal((await f.call('start','teacher',{set_no:1,subject_id:'ENG'})).status,403);
    });
    await t.test('save delegates ownership to the transaction and returns only the selection',async()=>{
      f.setRPC((name,p)=>{assert.equal(name,'school_practice_save');assert.deepEqual(p,{p_member_id:'student',p_attempt_id:id,p_question_id:'P01-ENG-01.02',p_selected_answer:3});return {attempt_id:id,question_id:p.p_question_id,selected_answer:3,is_correct:false,answer_key:2};});
      const r=await f.call('save','student',{member_id:'manager',attempt_id:id,question_id:'P01-ENG-01.02',selected_answer:3,answer_key:3});
      assert.deepEqual(r.body.item,{attempt_id:id,question_id:'P01-ENG-01.02',selected_answer:3});
      assert.equal((await f.call('save','student',{attempt_id:id,question_id:'P01-ENG-01.02',selected_answer:'3'})).status,400);
      assert.equal((await f.call('save','student',{attempt_id:id,question_id:'bad',selected_answer:1})).status,400);
    });
    await t.test('cross-site mutations and malformed identifiers cannot reach a transaction',async()=>{
      const before=f.requests.filter(x=>x.method==='POST').length;
      assert.equal((await f.call('submit','student',{attempt_id:id},{origin:'https://unrelated.invalid'})).status,403);
      assert.equal((await f.call('start','student',{set_no:'1&select=*',subject_id:'ENG'})).status,400);
      assert.equal((await f.call('start','student',{set_no:11,subject_id:'ENG'})).status,400);
      assert.equal((await f.call('submit','student',{attempt_id:'eq.other'})).status,400);
      assert.equal(f.requests.filter(x=>x.method==='POST').length,before);
    });
    await t.test('submitted answers stay private and managers can inspect the review queue',async()=>{
      attempt.status='submitted';attempt.submitted_at=new Date().toISOString();
      f.setRPC((name,p)=>{assert.equal(name,'school_practice_submit');assert.equal(p.p_member_id,'student');return attempt;});
      assert.equal('correct_count' in (await f.call('submit','student',{attempt_id:id})).body.item,false);
      assert.equal((await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG',attempt_id:id})).status,403);
      const q=await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG'});assert.equal(q.body.can_review,false);
      const r=await f.call('review','manager');assert.equal(r.body.attempts[0].member_name,'นักเรียนสมมติ');
      assert.equal('correct_count' in r.body.attempts[0],false);
      const detail=await f.call('subject','manager',undefined,{set_no:1,subject_id:'ENG',attempt_id:id});
      assert.equal(detail.body.can_review,true);assert.equal(detail.body.answers[0].selected_answer,1);
    });
    await t.test('manager identity comes from the cookie and grading opens student keys and results',async()=>{
      f.setRPC((name,p)=>{assert.equal(name,'school_practice_grade');assert.deepEqual(p,{p_grader_id:'manager',p_attempt_id:id});attempt.status='graded';attempt.correct_count=1;attempt.graded_at=new Date().toISOString();return attempt;});
      const r=await f.call('grade','manager',{attempt_id:id,p_grader_id:'forged',correct_count:2});
      assert.equal(r.body.item.correct_count,1);
      const detail=await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG'});
      assert.equal(detail.body.can_review,true);assert.equal(detail.body.questions[0].answer_key,2);assert.equal(detail.body.answers[0].is_correct,true);
      const own=await f.call('summary');assert.equal(own.body.attempts[0].correct_count,1);
      assert.equal(own.body.answers[0].is_correct,true);
    });
    await t.test('current School rights and current Temple membership override old cookies',async()=>{
      f.members.find(m=>m.member_id==='manager').can_manage=false;
      assert.equal((await f.call('grade','manager',{attempt_id:id})).status,403);
      f.members.find(m=>m.member_id==='manager').can_manage=true;
      f.setSource(false);assert.equal((await f.call('summary')).status,403);f.setSource(true);
      f.members[0].is_active=false;assert.equal((await f.call('summary')).status,403);f.members[0].is_active=true;
    });
    await t.test('missing practice schema leaves the original catalog usable and reports setup pending',async()=>{
      f.setMissing(true);const r=await f.call('summary');
      assert.equal(r.status,200);assert.deepEqual(r.body,{success:true,ready:false,setup_required:true});f.setMissing(false);
    });
    await t.test('multiple future sets paginate metadata beyond the PostgREST row limit',async()=>{
      f.rows.school_practice_sets.push({set_no:2,label:'ชุดสมมติ 2',is_active:true});
      f.rows.school_practice_questions.push(...Array.from({length:1100},(_,i)=>({question_id:'fixture-'+i,topic_id:'synthetic-'+i,set_no:2,subject_id:'SCI'})));
      const r=await f.call('summary');assert.equal(r.body.topics.length,1102);assert.equal(r.body.counts.find(c=>c.set_no===2).total_count,1100);
      assert.ok(f.requests.some(x=>x.url.searchParams.get('offset')==='1000'));
      assert.equal(JSON.stringify(r.body).includes('answer_key'),false);
    });
    await t.test('students cannot open inactive sets and unsupported methods are rejected',async()=>{
      f.rows.school_practice_sets[0].is_active=false;
      assert.equal((await f.call('subject','student',undefined,{set_no:1,subject_id:'ENG'})).status,404);
      assert.equal((await f.call('summary','student',undefined,{method:'PUT'})).status,405);
    });
  } finally { f.restore(); }
});

test('staff results retain individual history and protect unpublished answers', async t => {
  const f = fixture(), id = crypto.randomUUID(), draftId = crypto.randomUUID();
  const now = new Date().toISOString();
  const released = { attempt_id:id, member_id:'student', set_no:1, subject_id:'ENG', status:'graded', total_count:2,
    correct_count:1, submitted_at:now, graded_at:now, graded_by:'manager', updated_at:now };
  f.members.push(
    { member_id:'unstarted', member_name:'ยังไม่เริ่มสมมติ', is_active:true, can_study:true },
    { member_id:'former', member_name:'นักเรียนเดิมสมมติ', is_active:false, can_study:false }
  );
  f.rows.school_practice_attempts.push(released,
    { attempt_id:draftId, member_id:'student', set_no:1, subject_id:'MATH', status:'draft', total_count:4, correct_count:999, updated_at:now },
    { ...released, attempt_id:crypto.randomUUID(), member_id:'former', correct_count:0 }
  );
  f.rows.school_practice_answers.push(
    { attempt_id:id, question_id:'P01-ENG-01.01', selected_answer:1, is_correct:false },
    { attempt_id:id, question_id:'P01-ENG-01.02', selected_answer:2, is_correct:true }
  );
  try {
    await t.test('only current teachers and managers can read the student report', async () => {
      assert.equal((await f.call('results', null, undefined, {set_no:1})).status, 401);
      assert.equal((await f.call('results', 'student', undefined, {set_no:1, can_manage:true})).status, 403);
      const r = await f.call('results', 'teacher', undefined, {set_no:1});
      assert.equal(r.status, 200); assert.equal(r.headers['Cache-Control'], 'no-store');
      assert.equal((await f.call('results', 'manager', undefined, {set_no:1})).status, 200);
      assert.deepEqual(r.body.students.map(s => s.member_id), ['former','student','unstarted']);
      assert.equal(r.body.students.find(s => s.member_id === 'former').is_active, false);
      assert.deepEqual(r.body.students.find(s => s.member_id === 'unstarted').attempts, []);
      assert.deepEqual(r.body.counts, [{subject_id:'ENG',total_count:2}]);
      const attempts = r.body.students.find(s => s.member_id === 'student').attempts;
      assert.equal(attempts.find(a => a.status === 'graded').correct_count, 1);
      assert.equal(attempts.find(a => a.status === 'graded').graded_by_name, 'ผู้ดูแลสมมติ');
      assert.equal(attempts.find(a => a.status === 'graded').graded_at, now);
      assert.equal('correct_count' in attempts.find(a => a.status === 'draft'), false);
      assert.equal('graded_by' in attempts.find(a => a.status === 'draft'), false);
      for (const field of ['answer_key','selected_answer','is_correct','teacher-only','assigned_by']) assert.equal(JSON.stringify(r.body).includes(field), false);
      assert.equal(f.requests.some(r => r.method !== 'GET'), false);
    });
    await t.test('graded answers carry the student and grader identity, and remain read only for teachers', async () => {
      const r = await f.call('subject', 'teacher', undefined, {set_no:1,subject_id:'ENG',attempt_id:id});
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.student, {member_id:'student',member_name:'นักเรียนสมมติ'});
      assert.equal(r.body.graded_by_name, 'ผู้ดูแลสมมติ');
      assert.equal(r.body.answers[0].is_correct, false); assert.equal(r.body.questions[0].answer_key, 2);
      assert.equal((await f.call('subject', 'student', undefined, {set_no:1,subject_id:'ENG',attempt_id:id})).status, 403);
      assert.equal((await f.call('subject', 'teacher', undefined, {set_no:1,subject_id:'MATH',attempt_id:draftId})).status, 403);
      assert.equal((await f.call('subject', 'teacher', undefined, {set_no:2,subject_id:'ENG',attempt_id:id})).status, 404);
      assert.equal((await f.call('grade', 'teacher', {attempt_id:id})).status, 403);
    });
    await t.test('set selection includes closed history and validates filters', async () => {
      f.rows.school_practice_sets.push({set_no:2,label:'ชุดปิดสมมติ',is_active:false});
      f.rows.school_practice_attempts.push({...released,attempt_id:crypto.randomUUID(),set_no:2,correct_count:2});
      const r = await f.call('results', 'teacher', undefined, {set_no:2});
      assert.equal(r.status, 200); assert.equal(r.body.sets[1].is_active, false);
      const student = r.body.students.find(s => s.member_id === 'student');
      assert.equal(student.attempts.length, 1); assert.equal(student.attempts[0].set_no, 2);
      assert.equal(student.attempts[0].correct_count, 2);
      assert.equal((await f.call('results', 'teacher', undefined, {set_no:'1&select=*'})).status, 400);
      assert.equal((await f.call('results', 'teacher', undefined, {set_no:11})).status, 400);
      assert.equal((await f.call('results', 'teacher', undefined, {set_no:3})).status, 404);
    });
    await t.test('report reads paginate students and attempts instead of silently truncating', async () => {
      for (let i = 0; i < 1001; i++) {
        const member_id = `synthetic-${String(i).padStart(4,'0')}`;
        f.members.push({member_id,member_name:member_id,is_active:true,can_study:true});
        f.rows.school_practice_attempts.push({...released,member_id,attempt_id:crypto.randomUUID()});
      }
      const r = await f.call('results', 'manager', undefined, {set_no:1});
      assert.equal(r.status, 200); assert.equal(r.body.students.length, 1004);
      assert.equal(r.body.students.reduce((n,s) => n + s.attempts.length, 0), 1004);
      for (const table of ['school_members','school_practice_attempts']) assert.ok(f.requests.some(r => r.url.pathname.endsWith(table) && r.url.searchParams.get('offset') === '1000'));
    });
    await t.test('revoked teacher or source membership cannot reuse an existing session to read results', async () => {
      const teacher = f.members.find(m => m.member_id === 'teacher');
      teacher.can_teach = false;
      assert.equal((await f.call('results', 'teacher', undefined, {set_no:1})).status, 403);
      teacher.can_teach = true; f.setSource(false);
      assert.equal((await f.call('results', 'teacher', undefined, {set_no:1})).status, 403);
      f.setSource(true);
    });
  } finally { f.restore(); }
});



test('real exam release permits teachers across creators and preserves exam conditions',async()=>{
  const f=fixture(), id=crypto.randomUUID();
  try {
    for(const [table,track] of [['school_exam_sessions','military'],['school_alevel_exam_sessions','alevel']]) {
      const row={session_id:id,title:'Synthetic exam',created_by:'manager',subject_id:'ENG',set_no:2,duration_minutes:240,opens_at:'2026-10-08T05:00:00Z',result_policy:'manual',answer_policy:'manual',answer_release_at:null};
      f.rows[table]=[row];
      const denied=await f.call('exam-release-results','student',{session_id:id,can_teach:true,with_answers:true},{track});
      assert.equal(denied.status,403);assert.equal(row.result_policy,'manual');
      const result=await f.call('exam-release-results','teacher',{session_id:id,duration_minutes:1,answer_policy:'with_result'},{track});
      assert.equal(result.status,200);assert.equal(row.result_policy,'immediate');assert.equal(row.answer_policy,'manual');
      assert.equal(row.duration_minutes,240);assert.equal(row.created_by,'manager');assert.equal(row.updated_by,'teacher');
      const answers=await f.call('exam-release-results','manager',{session_id:id,with_answers:true},{track});
      assert.equal(answers.status,200);assert.equal(row.answer_policy,'with_result');assert.equal(row.answer_release_at,null);
      const missing=await f.call('exam-release-results','teacher',{session_id:crypto.randomUUID()},{track});
      assert.equal(missing.status,404);
    }
  }finally{f.restore();}
});

function realExamFixture(track) {
  const f=fixture(), prefix=track==='alevel'?'school_alevel':'school';
  const id=crypto.randomUUID(), submittedId=crypto.randomUUID(), draftId=crypto.randomUUID();
  const sid=track==='alevel'?'AL61':null;
  const paper={session_id:id,title:'Synthetic timed exam',subject_id:sid,set_no:2,result_policy:'manual',answer_policy:'manual',created_by:'manager',is_published:true,audience_mode:'all_students'};
  f.rows[prefix+'_practice_sets']=[{set_no:1,label:'Practice',is_active:true},{set_no:2,label:'Original',is_active:true}];
  f.rows[prefix+'_exam_sessions']=[paper,{...paper,session_id:crypto.randomUUID(),set_no:1}];
  const attempt={exam_attempt_id:submittedId,session_id:id,member_id:'student',attempt_no:1,status:'submitted',total_count:4,correct_count:2,started_at:'2026-10-08T05:00:00Z',deadline_at:'2026-10-08T09:00:00Z',submitted_at:'2026-10-08T08:00:00Z',timed_out:false};
  f.rows[prefix+'_exam_attempts']=[attempt,{...attempt,exam_attempt_id:draftId,attempt_no:2,status:'draft',correct_count:999,submitted_at:null}];
  f.rows[prefix+'_practice_questions']=[1,2,3,4].map(i=>({question_id:'synthetic-exam-'+i,set_no:2,topic_id:track==='alevel'?'AL61-01.01':i<=2?'ENG-01.01':'MATH-01.01',subject_id:track==='alevel'?'AL61':i<=2?'ENG':'MATH',sort_order:i,question_no:i,prompt:'Synthetic question '+i,choices:['A','B','C','D'],answer_key:2,answer_key_json:i===2?'3.14':i===3?{a:1,b:2}:2,question_type:i===2?'numeric':i===3?'complex':'choice',question_image_url:'https://images.invalid/synthetic.webp',explanation:'Synthetic teacher explanation',reasoning:'Synthetic teacher reasoning'}));
  f.rows[prefix+'_exam_answers']=[{exam_attempt_id:submittedId,question_id:'synthetic-exam-1',selected_answer:2,response_value:2,is_correct:true},{exam_attempt_id:submittedId,question_id:'synthetic-exam-2',selected_answer:1,response_value:'0',is_correct:false},{exam_attempt_id:submittedId,question_id:'synthetic-exam-3',selected_answer:2,response_value:{a:1,b:2},is_correct:true}];
  return {...f,prefix,id,submittedId,draftId,paper,attempt,track};
}

test('staff can read real-exam scores and answers without publishing or modifying an exam',async t=>{
  for(const track of ['military','alevel']) await t.test(track,async t=>{
    const f=realExamFixture(track), query={track,set_no:2};
    try {
      await t.test('students and anonymous sessions cannot enter staff reports, including forged roles',async()=>{
        for(const actor of [null,'student']) {
          assert.equal((await f.call('exam-results',actor,undefined,{...query,can_teach:true})).status,actor?403:401);
          assert.equal((await f.call('exam-review',actor,undefined,{track,exam_attempt_id:f.submittedId,can_manage:true})).status,actor?403:401);
        }
      });
      await t.test('teacher with no study permission sees submitted scores and all retained attempts, separate from practice',async()=>{
        const r=await f.call('exam-results','teacher',undefined,query);
        assert.equal(r.status,200);assert.equal(r.body.sessions.length,1);
        const student=r.body.students.find(s=>s.member_id==='student');
        assert.equal(student.attempts.length,2);
        assert.equal(student.attempts.find(a=>a.status==='submitted').correct_count,2);
        assert.equal(student.attempts.find(a=>a.status==='submitted').result_visible,false);
        assert.equal('correct_count' in student.attempts.find(a=>a.status==='draft'),false);
        assert.equal(r.body.students.some(s=>s.member_id==='teacher'),false);
        assert.equal(JSON.stringify(r.body).includes('Synthetic teacher'),false);
        assert.equal(JSON.stringify(r.body).includes('selected_answer'),false);
        assert.equal(f.requests.some(r=>r.url.pathname.endsWith('_practice_attempts')),false);
      });
      await t.test('teachers review a submitted attempt with student identity and per-subject totals including unanswered questions',async()=>{
        const r=await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:f.submittedId,member_id:'manager'});
        assert.equal(r.status,200);assert.equal(r.body.staff_review,true);
        assert.deepEqual(r.body.student,{member_id:'student',member_name:'นักเรียนสมมติ'});
        assert.equal(r.body.attempt.correct_count,2);assert.equal(r.body.attempt.result_visible,true);
        assert.equal(r.body.questions.length,4);assert.equal(r.body.answers.length,3);
        assert.equal(r.body.questions[0].question_image_url,'https://images.invalid/synthetic.webp');
        assert.equal(r.body.questions[0].answer_key,2);assert.equal(r.body.answers[0].is_correct,true);
        assert.equal(r.body.subject_scores.reduce((n,s)=>n+s.total_count,0),4);
        assert.equal(r.body.subject_scores.reduce((n,s)=>n+s.correct_count,0),2);
        assert.equal(r.body.subject_scores.reduce((n,s)=>n+s.answered_count,0),3);
        if(track==='military') assert.deepEqual(r.body.subject_scores,[{subject_id:'ENG',total_count:2,answered_count:2,correct_count:1},{subject_id:'MATH',total_count:2,answered_count:1,correct_count:1}]);
        else {
          assert.equal(r.body.questions[1].response_mode,'numeric');assert.equal(r.body.answers[1].response,'0');
          assert.equal(r.body.questions[2].response_mode,'complex');assert.deepEqual(r.body.answers[2].response,{a:1,b:2});
          assert.deepEqual(r.body.questions[2].answer_key,{a:1,b:2});
        }
        assert.equal(f.paper.result_policy,'manual');assert.equal(f.paper.answer_policy,'manual');
        assert.equal(f.requests.every(r=>r.method==='GET'),true);
      });
      await t.test('managers may read other creators, draft reviews do not submit or score the attempt',async()=>{
        assert.equal((await f.call('exam-review','manager',undefined,{track,exam_attempt_id:f.submittedId})).status,200);
        assert.equal((await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:f.draftId})).status,409);
        assert.equal(f.rows[f.prefix+'_exam_attempts'].find(a=>a.exam_attempt_id===f.draftId).status,'draft');
        assert.equal(f.requests.every(r=>r.method==='GET'),true);
      });
      await t.test('released score totals do not expose unreleased student answers or other students',async()=>{
        f.rows[f.prefix+'_exam_attempts']=f.rows[f.prefix+'_exam_attempts'].filter(a=>a.exam_attempt_id!==f.draftId);
        let r=await f.call('exam-open','student',undefined,{track,session_id:f.id,exam_attempt_id:crypto.randomUUID()});
        assert.equal(r.status,200);assert.equal('correct_count' in r.body.attempt,false);assert.deepEqual(r.body.subject_scores,[]);
        assert.equal(r.body.can_review,false);assert.equal('staff_review' in r.body,false);
        for(const q of r.body.questions) assert.equal('answer_key' in q,false);
        for(const a of r.body.answers) assert.equal('is_correct' in a,false);
        f.paper.result_policy='immediate';
        r=await f.call('exam-open','student',undefined,{track,session_id:f.id});
        assert.equal(r.status,200);assert.equal(r.body.attempt.correct_count,2);
        assert.equal(r.body.subject_scores.reduce((n,s)=>n+s.correct_count,0),2);
        assert.equal(r.body.can_review,false);
        for(const q of r.body.questions) assert.equal('answer_key' in q,false);
        for(const a of r.body.answers) assert.equal('is_correct' in a,false);
        f.paper.result_policy='manual';
      });
      await t.test('closed students and more than 1000 attempts retain report history',async()=>{
        for(let i=0;i<1001;i++) {
          const member_id='exam-history-'+String(i).padStart(4,'0');
          f.members.push({member_id,member_name:member_id,is_active:false,can_study:false});
          f.rows[f.prefix+'_exam_attempts'].push({...f.attempt,member_id,exam_attempt_id:crypto.randomUUID()});
        }
        const r=await f.call('exam-results','manager',undefined,query);
        assert.equal(r.status,200);assert.equal(r.body.students.length,1002);
        assert.equal(r.body.students.flatMap(s=>s.attempts).length,1002);
        assert.ok(f.requests.some(r=>r.url.pathname.endsWith('_exam_attempts')&&r.url.searchParams.get('offset')==='1000'));
        assert.ok(f.requests.some(r=>r.url.pathname.endsWith('school_members')&&r.url.searchParams.get('offset')==='1000'));
      });
      await t.test('set, session, attempt and current permissions are validated on every read',async()=>{
        assert.equal((await f.call('exam-results','teacher',undefined,{...query,set_no:'2&select=*'})).status,400);
        assert.equal((await f.call('exam-results','teacher',undefined,{...query,session_id:crypto.randomUUID()})).status,404);
        assert.equal((await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:'bad-id'})).status,400);
        assert.equal((await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:crypto.randomUUID()})).status,404);
        f.members.find(m=>m.member_id==='teacher').can_teach=false;
        assert.equal((await f.call('exam-results','teacher',undefined,query)).status,403);
        assert.equal((await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:f.submittedId})).status,403);
        f.members.find(m=>m.member_id==='teacher').can_teach=true;f.setSource(false);
        assert.equal((await f.call('exam-review','teacher',undefined,{track,exam_attempt_id:f.submittedId})).status,403);
      });
    }finally{f.restore();}
  });
});

test('report rendering links real exams from both entry points and keeps practice separate',async t=>{
  const {createPractice}=await import('../public/practice.js');
  for(const track of ['military','alevel']) await t.test(track,async()=>{
    const f=realExamFixture(track), previousDocument=globalThis.document;
    class TestElement {
      constructor(){this.innerHTML='';this.textContent='';this.listeners=new Map();this.children=new Map();this.open=false;}
      addEventListener(name,fn){this.listeners.set(name,fn);}
      removeEventListener(name){this.listeners.delete(name);}
      querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new TestElement());return this.children.get(selector);}
      removeAttribute(){}
      showModal(){this.open=true;}
      close(){this.open=false;}
    }
    const documentRoot=new TestElement();globalThis.document=documentRoot;
    const main=new TestElement(),modal=documentRoot.querySelector('#practice-dialog'),body=documentRoot.querySelector('#practice-body'),title=documentRoot.querySelector('#practice-title');
    let controller;
    const emit=async(root,name,dataset={},id='',value='')=>{
      const element={dataset,id,value,closest(){return this;},hasAttribute(attr){const key=attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return key in dataset;}};
      root.listeners.get(name)({target:element});
      // Flush async handler / API promises without relying on a browser or wall-clock sleeps.
      for(let i=0;i<5;i++)await new Promise(setImmediate);
    };
    try {
      f.rows[f.prefix+'_practice_attempts']=[];f.rows[f.prefix+'_practice_answers']=[];
      const data={member:{member_id:'teacher',can_teach:true,can_manage:false,can_study:false},subjects:track==='alevel'?[{subject_id:'AL61',subject_name_th:'คณิตศาสตร์ A-Level'}]:[{subject_id:'ENG',subject_name_th:'ภาษาอังกฤษ'},{subject_id:'MATH',subject_name_th:'คณิตศาสตร์'}],topics:[]};
      const api=async(url,options)=>{
        const params=Object.fromEntries(new URL(url,'https://school.nathoeng.com').searchParams);
        const r=await f.call(params.route,'teacher',options?.body?JSON.parse(options.body):undefined,{...params,track});
        if(r.status!==200)throw Error(r.body.message);return r.body;
      };
      controller=createPractice({main,data,api,notice(){},rerender(){},getSubject:()=>data.subjects[0].subject_id,apiPath:track==='alevel'?'/api/alevel':'/api/practice'});
      await controller.refresh();
      await emit(main,'change',{},'practice-set','2');
      await emit(main,'click',{studentResults:''});
      assert.match(title.textContent,/ผลสอบจริง/);
      assert.match(body.querySelector('#practice-results-list').innerHTML,/50%/);
      await emit(body,'click',{studentId:'student'});
      assert.match(body.innerHTML,/กำลังสอบ 1/);assert.match(body.innerHTML,/data-exam-review-attempt/);
      await emit(body,'click',{examReviewAttempt:f.submittedId});
      assert.match(title.textContent,/นักเรียนสมมติ/);assert.match(body.innerHTML,/50%/);assert.match(body.innerHTML,/คะแนนรายวิชา/);
      assert.match(body.innerHTML,/ตอบ 3 \/ 4 ข้อ/);
      await emit(body,'click',{realExamReview:''});
      assert.match(body.innerHTML,/Synthetic teacher explanation/);assert.match(body.innerHTML,/disabled/);
      await emit(body,'click',{realExamIndex:'3'});
      await emit(body,'click',{realExamNext:''});
      assert.match(body.innerHTML,/คะแนนรายวิชา/);assert.match(body.innerHTML,/50%/);
      await emit(body,'click',{examReviewBack:''});
      assert.match(title.textContent,/ผลสอบจริง/);assert.match(body.innerHTML,/data-results-mode/);
      await emit(body,'click',{resultsMode:'practice'});
      assert.match(title.textContent,/ผลตรวจ/);assert.doesNotMatch(body.innerHTML,/data-exam-review-attempt/);
      await emit(body,'click',{resultsMode:'exam'});
      await emit(body,'click',{resultsList:''});
      await emit(body,'click',{examManage:''});
      assert.match(body.innerHTML,/data-exam-results/);
      await emit(body,'click',{examResults:f.id});
      assert.match(title.textContent,/ผลสอบจริง/);assert.match(body.innerHTML,new RegExp('value="'+f.id+'" selected'));
      await emit(body,'input',{},'practice-results-search','missing learner');
      assert.doesNotMatch(body.querySelector('#practice-results-list').innerHTML,/data-student-id/);
      await emit(body,'input',{},'practice-results-search','');
      assert.match(body.querySelector('#practice-results-list').innerHTML,/data-student-id/);
      assert.equal(f.requests.every(r=>r.method==='GET'),true);
    }finally{controller?.destroy();globalThis.document=previousDocument;f.restore();}
  });
});
