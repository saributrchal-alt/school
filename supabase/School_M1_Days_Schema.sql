-- M.1 English: What Day Is It? (20-item independent exercise).
-- Schema and grading logic only. Actual questions, answers, explanations,
-- and vocabulary are intentionally seeded PRIVATELY in School Supabase.
-- Do not commit a seed containing answer keys to this public repository.
begin;
create table if not exists public.school_m1_days_questions (
  question_no integer primary key check (question_no between 1 and 20),
  prompt_en text not null,
  prompt_th text not null,
  answer text not null check (answer ~* '^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$'),
  answer_sentence text not null,
  explanation_th text not null,
  vocabulary jsonb not null default '[]'::jsonb check (jsonb_typeof(vocabulary)='array')
);
create table if not exists public.school_m1_days_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  member_id text not null references public.school_members(member_id),
  correct_count integer not null check (correct_count between 0 and 20),
  total_count integer not null default 20 check(total_count=20),
  responses jsonb not null,
  feedback jsonb not null,
  submitted_at timestamptz not null default now()
);
create index if not exists school_m1_days_attempts_member_time
  on public.school_m1_days_attempts(member_id,submitted_at desc);
alter table public.school_m1_days_questions enable row level security;
alter table public.school_m1_days_attempts enable row level security;
revoke all on public.school_m1_days_questions,public.school_m1_days_attempts from public,anon,authenticated;
grant select on public.school_m1_days_questions to service_role;
grant select,insert on public.school_m1_days_attempts to service_role;
CREATE OR REPLACE FUNCTION public.school_m1_days_grade(p_member_id text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_item jsonb; v_number integer; v_seen integer[]:=array[]::integer[];
 v_answers jsonb:='{}'::jsonb; v_feedback jsonb:='[]'::jsonb;
 v_q public.school_m1_days_questions%rowtype;
 v_selected text; v_correct boolean; v_score integer:=0; v_id uuid; v_time timestamptz;
begin
 perform 1 from public.school_members
 where member_id=p_member_id and is_active and can_study for share;
 if not found then raise sqlstate 'PT403' using message='study_permission_required'; end if;
 if (select count(*) from public.school_m1_days_questions)<>20 or
    (select count(distinct question_no) from public.school_m1_days_questions)<>20 then
    raise sqlstate 'PT503' using message='quiz_not_ready';
 end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>20 then
  raise sqlstate 'PT400' using message='answers_must_include_20_questions';
 end if;
 for v_item in select value from jsonb_array_elements(p_answers) loop
  if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'question_no')<>'number'
     or coalesce(v_item->>'question_no','') !~ '^[0-9]{1,2}$'
     or jsonb_typeof(v_item->'answer')<>'string'
     or length(coalesce(v_item->>'answer',''))>80 then
    raise sqlstate 'PT400' using message='invalid_answer';
  end if;
  v_number:=(v_item->>'question_no')::integer;
  if v_number<1 or v_number>20 or v_number=any(v_seen) then
    raise sqlstate 'PT400' using message='duplicate_or_invalid_question';
  end if;
  v_seen:=array_append(v_seen,v_number);
  v_selected:=lower(btrim(v_item->>'answer'));
  v_selected:=regexp_replace(v_selected,'^(it[[:space:]]+(is|was|will[[:space:]]+be)[[:space:]]+)','','i');
  v_selected:=regexp_replace(v_selected,'[.!?]+$','');
  v_answers:=v_answers||jsonb_build_object(v_number::text,v_selected);
 end loop;
 for v_q in select * from public.school_m1_days_questions order by question_no loop
  v_selected:=v_answers->>(v_q.question_no::text);
  v_correct:=v_selected=lower(v_q.answer);
  if v_correct then v_score:=v_score+1; end if;
  v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object(
    'question_no',v_q.question_no,'selected_answer',v_selected,'is_correct',v_correct,
    'answer',v_q.answer,'answer_sentence',v_q.answer_sentence,
    'question_translation',v_q.prompt_th,'explanation',v_q.explanation_th,
    'vocabulary',v_q.vocabulary
  ));
 end loop;
 insert into public.school_m1_days_attempts(member_id,correct_count,responses,feedback)
 values(p_member_id,v_score,v_answers,v_feedback)
 returning attempt_id,submitted_at into v_id,v_time;
 return jsonb_build_object('attempt_id',v_id,'correct_count',v_score,
   'total_count',20,'submitted_at',v_time,'feedback',v_feedback);
end;
$function$

revoke all on function public.school_m1_days_grade(text,jsonb) from public,anon,authenticated;
grant execute on function public.school_m1_days_grade(text,jsonb) to service_role;
commit;
-- Verify separately: select count(*) from public.school_m1_days_questions; -- must equal 20.
