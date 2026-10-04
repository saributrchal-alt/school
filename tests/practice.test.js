import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import practice from '../api/practice.js';
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
    assert.equal(method,'GET'); assert.ok(rows[table],table);
    const reserved = new Set(['select','order','limit','offset']);
    let result = rows[table].filter(row => [...url.searchParams].every(([key,value]) => {
      if (reserved.has(key)) return true;
      if (value.startsWith('eq.')) return String(row[key])===value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4,-1).split(',').includes(String(row[key]));
      throw new Error('Unexpected filter '+value);
    }));
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
    await practice(req,res); return result;
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
    await t.test('teacher can preview explanations but cannot grade or see other students answers',async()=>{
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
