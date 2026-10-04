import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import school from '../api/school.js';
import session from '../api/session.js';

const templePaths = ['../../nathoeng-temple/api/admin-bookings.js','../../nathoeng-temple/api/my-bookings.js'];
const hasTemple = templePaths.every(p => existsSync(new URL(p, import.meta.url)));
const templeAdmin = hasTemple ? (await import(templePaths[0])).default : null;
const templeMember = hasTemple ? (await import(templePaths[1])).default : null;
const key = crypto.randomBytes(32).toString('base64');
const sourceSecret = crypto.randomBytes(32).toString('base64');

function signed(payload, secret=key) {
  const p=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url');
}
const sourceCookie = (id,role='member',extra={}) => 'nathoeng_session='+signed({memberId:id,role,exp:Date.now()+86400000,...extra},sourceSecret);
const handoff = (id,extra={}) => {const now=Date.now();return signed({memberId:id,purpose:'school-handoff',aud:'school.nathoeng.com',iat:now,exp:now+300000,...extra});};

function fixture() {
  const rows = {
    members:[{id:'admin-1',role:'admin',full_name:'ผู้ดูแลทดสอบ',membership_status:'active'},{id:'student-1',role:'member',full_name:'นักเรียนทดสอบ',membership_status:'active'}],
    school_members:[],school_member_bridge_events:[],school_topic_progress:[],school_question_attempts:[],
    exam_subjects_master:[{subject_id:'ENG',subject_name_th:'ภาษาอังกฤษ'}],
    exam_chapters:[{chapter_id:'ENG-01',subject_id:'ENG',chapter_name_th:'ภาษา',sort_order:1}],
    exam_topics:[{topic_id:'ENG-01.01',chapter_id:'ENG-01',subject_id:'ENG',topic_name_th:'การเรียงคำ',sort_order:1},{topic_id:'ENG-01.02',chapter_id:'ENG-01',subject_id:'ENG',topic_name_th:'หัวข้อสอง',sort_order:2}],
    exam_questions:[{question_id:'EX2562-ENG-001',source_id:'EX62_63',primary_topic_id:'ENG-01.01',year_be:2562,exam_question_no:1,content_focus_th:'เรียงคำตามลำดับอักษร',pdf_pages:[2],printed_pages:[1],answer_key:4}]
  };
  const audit=[];
  const setEnv=kind=>{process.env.SUPABASE_URL=kind==='temple'?'https://temple-db.invalid':'https://school-db.invalid';process.env.SUPABASE_SECRET_KEY='fixture-only';process.env.SCHOOL_BRIDGE_KEY=key;process.env.SESSION_SECRET=sourceSecret;};
  async function invoke(handler,url,options={}) {
    const u=new URL(url),oldUrl=process.env.SUPABASE_URL;
    setEnv(u.hostname==='nathoeng.com'?'temple':'school');
    const headers=Object.fromEntries(Object.entries(options.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
    const req={method:options.method||'GET',url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:{host:u.host,...headers},body:typeof options.body==='string'?JSON.parse(options.body):options.body};
    const result={status:200,headers:{},body:null};
    const res={status(n){result.status=n;return this;},setHeader(k,v){result.headers[k.toLowerCase()]=v;return this;},json(x){result.body=x;return this;},end(){return this;}};
    try {await handler(req,res);return result;} finally {process.env.SUPABASE_URL=oldUrl;}
  }
  const response=result=>new Response(result.body===null?'':JSON.stringify(result.body),{status:result.status,headers:result.headers});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,options={})=>{
    const u=new URL(input),method=options.method||'GET';
    if(u.hostname==='school.nathoeng.com')return response(await invoke(u.pathname==='/api/session'?session:school,u.href,options));
    if(u.hostname==='nathoeng.com') {
      if(templeMember)return response(await invoke(templeMember,u.href,options));
      const p=JSON.parse(options.body),signature=crypto.createHmac('sha256',key).update(JSON.stringify(p)).digest('hex');
      if(options.headers['X-School-Signature']!==signature)return new Response('{"success":false}',{status:403});
      return new Response(JSON.stringify({success:true,is_active:rows.members.some(m=>m.id===p.member_id&&m.membership_status==='active')}));
    }
    if(!['school-db.invalid','temple-db.invalid'].includes(u.hostname))throw Error('Unexpected network request');
    const table=u.pathname.split('/').pop(),all=rows[table];
    if(!all)throw Error('Unexpected table '+table);
    const matches=row=>Array.from(u.searchParams).every(([field,filter])=>{
      if(['select','order','limit','on_conflict'].includes(field))return true;
      if(filter.startsWith('eq.'))return String(row[field])===filter.slice(3);
      if(filter.startsWith('lte.'))return Date.parse(row[field])<=Date.parse(filter.slice(4));
      throw Error('Unexpected filter '+filter);
    });
    let selected=all.filter(matches);
    if(method==='POST') {
      const p=JSON.parse(options.body);
      const fields=table==='school_members'?['member_id']:table==='school_member_bridge_events'?['event_id']:['member_id','topic_id'];
      const existing=all.find(row=>fields.every(f=>row[f]===p[f]));
      if(existing&&!u.searchParams.has('on_conflict'))return new Response('{}',{status:409});
      if(existing)Object.assign(existing,p);else all.push(p);
      selected=[existing||p];audit.push({table,method,p:structuredClone(p)});
    } else if(method==='PATCH') {
      const p=JSON.parse(options.body);selected.forEach(row=>Object.assign(row,p));audit.push({table,method,p:structuredClone(p)});
    } else if(method!=='GET')throw Error('Unexpected DB method');
    const select=u.searchParams.get('select');
    if(select&&select!=='*')selected=selected.map(row=>Object.fromEntries(select.split(',').filter(k=>k in row).map(k=>[k,row[k]])));
    return new Response(JSON.stringify(selected));
  };
  setEnv('school');
  const payload=extra=>({member_id:'student-1',member_name:'นักเรียนทดสอบ',assigned_by:'admin-1',can_study:true,can_teach:false,can_manage:false,is_active:true,issued_at:new Date().toISOString(),event_id:crypto.randomUUID(),...extra});
  const importRequest=async(p,signature)=>invoke(school,'https://school.nathoeng.com/api/school?route=member-import',{method:'POST',body:p,headers:{'x-school-signature':signature??crypto.createHmac('sha256',key).update(JSON.stringify(p)).digest('hex')}});
  const exchange=token=>invoke(session,'https://school.nathoeng.com/api/session',{method:'POST',body:{token},headers:{origin:'https://nathoeng.com'}});
  const schoolGet=(route,cookie,query='')=>invoke(school,`https://school.nathoeng.com/api/school?route=${route}${query}`,{headers:{cookie}});
  return {rows,audit,invoke,payload,importRequest,exchange,schoolGet,restore(){globalThis.fetch=originalFetch;}};
}

test('School permissions, import, handoff and current membership',async t=>{
  const f=fixture();
  try {
    await t.test('forged and expired bridge requests cannot create members',async()=>{
      assert.equal((await f.importRequest(f.payload(),'0'.repeat(64))).status,403);
      assert.equal((await f.importRequest(f.payload({issued_at:new Date(Date.now()-360000).toISOString()}))).status,403);
      assert.equal(f.rows.school_members.length,0);
    });
    let first;
    await t.test('successful import is idempotent and records its actor',async()=>{
      first=f.payload();assert.equal((await f.importRequest(first)).status,200);
      assert.equal((await f.importRequest(first)).status,200);
      assert.equal(f.rows.school_members.length,1);assert.equal(f.rows.school_member_bridge_events.length,1);
      assert.equal(f.rows.school_members[0].assigned_by,'admin-1');
    });
    await t.test('Account tokens, expired handoffs and unrelated origins are rejected',async()=>{
      assert.equal((await f.exchange(handoff('student-1',{purpose:'account-session'}))).status,401);
      assert.equal((await f.exchange(handoff('student-1',{exp:Date.now()-1,iat:Date.now()-300001}))).status,401);
      const r=await f.invoke(session,'https://school.nathoeng.com/api/session',{method:'POST',body:{token:handoff('student-1')},headers:{origin:'https://unrelated.invalid'}});
      assert.equal(r.status,403);
    });
    let cookie;
    await t.test('handoff sets a secure School cookie and admits the same member',async()=>{
      const r=await f.exchange(handoff('student-1'));assert.equal(r.status,303);
      assert.equal(r.headers.location,'/');assert.match(r.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax; Max-Age=14400/);
      cookie=r.headers['set-cookie'].split(';')[0];
      const me=await f.invoke(session,'https://school.nathoeng.com/api/session',{headers:{cookie}});
      assert.equal(me.status,200);assert.equal(me.body.member.member_id,'student-1');
    });
    await t.test('student cannot see answer keys or the member roster',async()=>{
      const q=await f.schoolGet('questions',cookie,'&topic_id=ENG-01.01');
      assert.equal(q.status,200);assert.equal('answer_key' in q.body.questions[0],false);
      assert.equal((await f.schoolGet('members',cookie)).status,403);
      const c=await f.schoolGet('catalog',cookie);assert.equal(c.status,200);assert.equal(c.body.question_count,1);
      assert.equal(c.body.topics[0].counts.total,1);
    });
    await t.test('progress is recorded only for the cookie member; cross-site writes are blocked',async()=>{
      const url='https://school.nathoeng.com/api/school?route=progress';
      const body={member_id:'admin-1',topic_id:'ENG-01.01',status:'in_progress'};
      assert.equal((await f.invoke(school,url,{method:'POST',body,headers:{cookie,origin:'https://unrelated.invalid'}})).status,403);
      assert.equal((await f.invoke(school,url,{method:'POST',body,headers:{cookie,origin:'https://school.nathoeng.com'}})).status,200);
      assert.equal(f.rows.school_topic_progress[0].member_id,'student-1');
    });
    await t.test('teacher permissions are rechecked for an already-open session',async()=>{
      const p=f.payload({can_teach:true,issued_at:new Date(Date.parse(first.issued_at)+100).toISOString()});
      assert.equal((await f.importRequest(p)).status,200);
      const q=await f.schoolGet('questions',cookie,'&topic_id=ENG-01.01');assert.equal(q.body.questions[0].answer_key,4);
      assert.equal((await f.schoolGet('members',cookie)).status,403);
    });
    await t.test('Temple membership cancellation blocks an existing School session',async()=>{
      f.rows.members[1].membership_status='cancelled';
      assert.equal((await f.schoolGet('catalog',cookie)).status,403);
      f.rows.members[1].membership_status='active';
    });
    await t.test('revocation blocks the old session and an older signed grant cannot undo it',async()=>{
      assert.equal((await f.importRequest(f.payload({is_active:false,can_study:false,can_teach:false,issued_at:new Date(Date.parse(first.issued_at)+200).toISOString()}))).status,200);
      assert.equal((await f.schoolGet('catalog',cookie)).status,403);
      assert.equal(f.rows.school_topic_progress.length,1);
      assert.equal((await f.importRequest(f.payload({issued_at:new Date(Date.parse(first.issued_at)+150).toISOString()}))).status,409);
      assert.equal(f.rows.school_members[0].is_active,false);
    });
  } finally {f.restore();}
});

test('actual Temple sender → School receiver → member handoff',{skip:!hasTemple},async()=>{
  const f=fixture();
  try {
    const request={method:'POST',body:{memberId:'student-1',department:'school',active:true,canStudy:true,canTeach:false,canManage:false,assigned_by:'forged-admin'},headers:{cookie:sourceCookie('admin-1','admin')}};
    const assigned=await f.invoke(templeAdmin,'https://nathoeng.com/api/admin-bookings?route=assign-department',request);
    assert.equal(assigned.status,200);assert.equal(f.rows.school_members[0].assigned_by,'admin-1');
    const transferred=await f.invoke(templeMember,'https://nathoeng.com/api/my-bookings?route=school-handoff',{headers:{cookie:sourceCookie('student-1')}});
    assert.equal(transferred.status,200);
    const accepted=await f.exchange(transferred.body.token);assert.equal(accepted.status,303);
    const cookie=accepted.headers['set-cookie'].split(';')[0];assert.equal((await f.schoolGet('catalog',cookie)).status,200);
    f.rows.members[0].role='member';
    assert.equal((await f.invoke(templeAdmin,'https://nathoeng.com/api/admin-bookings?route=assign-department',request)).status,403);
    f.rows.members[0].role='admin';
    const acting=await f.invoke(templeMember,'https://nathoeng.com/api/my-bookings?route=school-handoff',{headers:{cookie:sourceCookie('student-1','member',{actingAdminId:'admin-1'})}});
    assert.equal(acting.status,403);
    const revoked=await f.invoke(templeAdmin,'https://nathoeng.com/api/admin-bookings?route=assign-department',{...request,body:{...request.body,active:false}});
    assert.equal(revoked.status,200);assert.equal((await f.schoolGet('catalog',cookie)).status,403);
  } finally {f.restore();}
});
