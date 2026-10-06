-- A-Level 2568 original exam as practice Set 2
-- Safe migration: keeps Set 1 untouched and keeps Set 2 hidden until the mixed-response UI is deployed.
BEGIN;
SET LOCAL standard_conforming_strings = on;

-- 1) Extend the practice bank without breaking Set 1.
ALTER TABLE public.school_alevel_practice_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'single_choice',
  ADD COLUMN IF NOT EXISTS answer_key_json jsonb;

ALTER TABLE public.school_alevel_practice_questions
  ALTER COLUMN answer_key DROP NOT NULL;

ALTER TABLE public.school_alevel_practice_questions
  DROP CONSTRAINT IF EXISTS school_alevel_practice_questions_choices_check;

ALTER TABLE public.school_alevel_practice_questions
  DROP CONSTRAINT IF EXISTS school_alevel_practice_questions_question_type_check;

ALTER TABLE public.school_alevel_practice_questions
  ADD CONSTRAINT school_alevel_practice_questions_choices_check
    CHECK (jsonb_typeof(choices)='array' AND jsonb_array_length(choices) BETWEEN 0 AND 10),
  ADD CONSTRAINT school_alevel_practice_questions_question_type_check
    CHECK (question_type IN ('single_choice','numeric','complex'));

ALTER TABLE public.school_alevel_practice_answers
  ADD COLUMN IF NOT EXISTS response_value jsonb;

ALTER TABLE public.school_alevel_practice_answers
  ALTER COLUMN selected_answer DROP NOT NULL;

-- Backfill legacy Set 1 into the generalized columns.
UPDATE public.school_alevel_practice_questions
SET answer_key_json = to_jsonb(answer_key)
WHERE answer_key_json IS NULL AND answer_key IS NOT NULL;

UPDATE public.school_alevel_practice_answers
SET response_value = to_jsonb(selected_answer)
WHERE response_value IS NULL AND selected_answer IS NOT NULL;

-- 2) Set 2 = exact A-Level 2568 source exam. Keep hidden until frontend/API deployment is complete.
INSERT INTO public.school_alevel_practice_sets
(set_no,label,display_label,source_year,source_title,source_type,description,is_active)
VALUES
(
  2,
  'A-Level 2568 · ข้อสอบจริง',
  'ชุด 2',
  2568,
  'ข้อสอบจริง A-Level 2568',
  'original_exam',
  'ข้อสอบจริงตามต้นฉบับ A-Level พ.ศ. 2568 ใช้ลำดับข้อ รูป ตัวเลือก และชนิดคำตอบตามต้นฉบับ',
  false
)
ON CONFLICT (set_no) DO UPDATE SET
  label=EXCLUDED.label,
  display_label=EXCLUDED.display_label,
  source_year=EXCLUDED.source_year,
  source_title=EXCLUDED.source_title,
  source_type=EXCLUDED.source_type,
  description=EXCLUDED.description,
  is_active=false;

-- 3) Copy all 315 imported source questions into Set 2.
INSERT INTO public.school_alevel_practice_questions
(
  question_id,set_no,topic_id,subject_id,sort_order,prompt,choices,question_no,
  question_image_url,source_page,source_year,source_title,source_type,
  answer_key,answer_key_json,question_type,explanation,reasoning,source_question_ids
)
SELECT
  'ALP2-' || q.question_id,
  2,
  q.primary_topic_id,
  q.subject_id,
  q.question_no,
  q.prompt,
  q.choices,
  q.question_no,
  q.question_image_url,
  q.source_page,
  q.year_be,
  s.source_title,
  'original_exam',
  CASE
    WHEN jsonb_typeof(q.answer_key)='number'
      AND q.question_type='single_choice'
    THEN (q.answer_key #>> '{}')::integer
    ELSE NULL
  END,
  q.answer_key,
  q.question_type,
  COALESCE(NULLIF(q.explanation,''),'เฉลยตามต้นฉบับ A-Level 2568'),
  COALESCE(NULLIF(q.reasoning,''),'ตรวจคำตอบตามเฉลยต้นฉบับ A-Level 2568'),
  jsonb_build_array(q.question_id)
FROM public.school_alevel_questions q
JOIN public.school_alevel_sources s ON s.source_id=q.source_id
WHERE q.year_be=2568
ON CONFLICT (question_id) DO UPDATE SET
  set_no=EXCLUDED.set_no,
  topic_id=EXCLUDED.topic_id,
  subject_id=EXCLUDED.subject_id,
  sort_order=EXCLUDED.sort_order,
  prompt=EXCLUDED.prompt,
  choices=EXCLUDED.choices,
  question_no=EXCLUDED.question_no,
  question_image_url=EXCLUDED.question_image_url,
  source_page=EXCLUDED.source_page,
  source_year=EXCLUDED.source_year,
  source_title=EXCLUDED.source_title,
  source_type=EXCLUDED.source_type,
  answer_key=EXCLUDED.answer_key,
  answer_key_json=EXCLUDED.answer_key_json,
  question_type=EXCLUDED.question_type,
  explanation=EXCLUDED.explanation,
  reasoning=EXCLUDED.reasoning,
  source_question_ids=EXCLUDED.source_question_ids;

-- 4) Numeric normalization used by automatic grading.
CREATE OR REPLACE FUNCTION public.school_alevel_json_numeric(p_value jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  t text;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value)='number' THEN
    RETURN (p_value::text)::numeric;
  END IF;
  IF jsonb_typeof(p_value)='string' THEN
    t := trim(both '"' from p_value::text);
    IF t ~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' THEN
      RETURN t::numeric;
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_alevel_answer_matches
(p_type text,p_key jsonb,p_response jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  k jsonb;
  kv record;
  rv jsonb;
  a numeric;
  b numeric;
BEGIN
  IF p_key IS NULL OR p_response IS NULL THEN RETURN false; END IF;

  IF p_type='numeric' THEN
    a := public.school_alevel_json_numeric(p_response);
    IF a IS NULL THEN RETURN false; END IF;

    IF jsonb_typeof(p_key)='array' THEN
      FOR k IN SELECT value FROM jsonb_array_elements(p_key)
      LOOP
        b := public.school_alevel_json_numeric(k);
        IF b IS NOT NULL AND abs(a-b) <= 0.000001 * greatest(1,abs(b)) THEN RETURN true; END IF;
      END LOOP;
      RETURN false;
    END IF;

    b := public.school_alevel_json_numeric(p_key);
    RETURN b IS NOT NULL AND abs(a-b) <= 0.000001 * greatest(1,abs(b));
  END IF;

  -- Multi-part yes/no items, e.g. 36.1 / 36.2 / 36.3.
  IF p_type='complex' AND jsonb_typeof(p_key)='object' THEN
    IF jsonb_typeof(p_response)<>'object' THEN RETURN false; END IF;
    FOR kv IN SELECT key,value FROM jsonb_each(p_key)
    LOOP
      IF NOT (p_response ? kv.key) THEN RETURN false; END IF;
      rv := p_response -> kv.key;
      IF jsonb_typeof(kv.value)='array' THEN
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(kv.value) e WHERE e.value=rv) THEN RETURN false; END IF;
      ELSIF kv.value<>rv THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  -- Ordinary choice items, including questions that accept more than one choice/free-all.
  IF jsonb_typeof(p_key)='array' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_key) e
      WHERE e.value=p_response
         OR (
           public.school_alevel_json_numeric(e.value) IS NOT NULL
           AND public.school_alevel_json_numeric(p_response) IS NOT NULL
           AND public.school_alevel_json_numeric(e.value)=public.school_alevel_json_numeric(p_response)
         )
    );
  END IF;

  RETURN p_key=p_response
    OR (
      public.school_alevel_json_numeric(p_key) IS NOT NULL
      AND public.school_alevel_json_numeric(p_response) IS NOT NULL
      AND public.school_alevel_json_numeric(p_key)=public.school_alevel_json_numeric(p_response)
    );
END;
$fn$;

-- 5) Generalized save RPC for Set 2 (choice, numeric and complex responses).
CREATE OR REPLACE FUNCTION public.school_alevel_practice_save_v2
(p_member_id text,p_attempt_id uuid,p_question_id text,p_response jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  q public.school_alevel_practice_questions%ROWTYPE;
  choice_count integer;
  part record;
  n numeric;
  selected integer;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_member_id AND is_active AND can_study
  FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required'; END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id AND member_id=p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found'; END IF;
  IF a.status<>'draft' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='attempt_locked'; END IF;

  SELECT * INTO q
  FROM public.school_alevel_practice_questions
  WHERE question_id=p_question_id AND set_no=a.set_no AND subject_id=a.subject_id;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_in_attempt'; END IF;

  IF q.question_type='numeric' THEN
    IF public.school_alevel_json_numeric(p_response) IS NULL THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_numeric_response';
    END IF;
    selected := NULL;

  ELSIF q.question_type='complex' AND jsonb_typeof(q.answer_key_json)='object' THEN
    IF jsonb_typeof(p_response)<>'object' THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_complex_response';
    END IF;
    FOR part IN SELECT key,value FROM jsonb_each(q.answer_key_json)
    LOOP
      IF NOT (p_response ? part.key) THEN
        RAISE SQLSTATE 'PT400' USING MESSAGE='incomplete_complex_response';
      END IF;
      n := public.school_alevel_json_numeric(p_response -> part.key);
      IF n IS NULL OR n NOT IN (1,2) THEN
        RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_complex_response';
      END IF;
    END LOOP;
    selected := NULL;

  ELSE
    choice_count := jsonb_array_length(q.choices);
    n := public.school_alevel_json_numeric(p_response);
    IF n IS NULL OR n<>trunc(n) OR n<1 OR n>choice_count THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
    END IF;
    selected := n::integer;
  END IF;

  INSERT INTO public.school_alevel_practice_answers
    (attempt_id,question_id,set_no,subject_id,selected_answer,response_value)
  VALUES
    (a.attempt_id,p_question_id,a.set_no,a.subject_id,selected,p_response)
  ON CONFLICT(attempt_id,question_id) DO UPDATE
    SET selected_answer=EXCLUDED.selected_answer,
        response_value=EXCLUDED.response_value,
        is_correct=NULL,
        updated_at=now();

  UPDATE public.school_alevel_practice_attempts
  SET updated_at=now()
  WHERE attempt_id=a.attempt_id;

  RETURN jsonb_build_object(
    'attempt_id',a.attempt_id,
    'question_id',p_question_id,
    'response_value',p_response
  );
END;
$fn$;

-- 6) Grade both legacy Set 1 and mixed-response Set 2 with one function.
CREATE OR REPLACE FUNCTION public.school_alevel_practice_grade
(p_grader_id text,p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  n integer;
  scored integer;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_grader_id AND is_active AND can_manage
  FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='manage_permission_required'; END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found'; END IF;
  IF a.status='graded' THEN RETURN to_jsonb(a); END IF;
  IF a.status<>'submitted' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='submit_before_grade'; END IF;

  SELECT count(*) INTO n
  FROM public.school_alevel_practice_answers
  WHERE attempt_id=a.attempt_id;

  IF n<>a.total_count OR a.total_count<>(
    SELECT count(*)
    FROM public.school_alevel_practice_questions
    WHERE set_no=a.set_no AND subject_id=a.subject_id
  ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='question_bank_changed';
  END IF;

  UPDATE public.school_alevel_practice_answers ans
  SET is_correct=public.school_alevel_answer_matches(
    q.question_type,
    COALESCE(q.answer_key_json,to_jsonb(q.answer_key)),
    COALESCE(ans.response_value,to_jsonb(ans.selected_answer))
  )
  FROM public.school_alevel_practice_questions q
  WHERE ans.attempt_id=a.attempt_id
    AND ans.question_id=q.question_id;

  SELECT count(*) INTO scored
  FROM public.school_alevel_practice_answers
  WHERE attempt_id=a.attempt_id AND is_correct;

  UPDATE public.school_alevel_practice_attempts
  SET status='graded',
      correct_count=scored,
      graded_at=now(),
      graded_by=p_grader_id,
      updated_at=now()
  WHERE attempt_id=a.attempt_id
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$fn$;

REVOKE ALL ON FUNCTION public.school_alevel_practice_save_v2(text,uuid,text,jsonb),
  public.school_alevel_json_numeric(jsonb),
  public.school_alevel_answer_matches(text,jsonb,jsonb)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.school_alevel_practice_save_v2(text,uuid,text,jsonb)
TO service_role;

-- 7) Integrity checks: must exactly mirror all seven imported 2568 source exams.
DO $$
DECLARE
  source_total integer;
  copied_total integer;
  bad_subjects integer;
BEGIN
  SELECT count(*) INTO source_total
  FROM public.school_alevel_questions
  WHERE year_be=2568;

  SELECT count(*) INTO copied_total
  FROM public.school_alevel_practice_questions
  WHERE set_no=2;

  SELECT count(*) INTO bad_subjects
  FROM public.school_alevel_subjects s
  LEFT JOIN (
    SELECT subject_id,count(*) AS n
    FROM public.school_alevel_practice_questions
    WHERE set_no=2
    GROUP BY subject_id
  ) x USING(subject_id)
  WHERE COALESCE(x.n,0)<>s.source_question_count_2568;

  IF source_total<>315 THEN
    RAISE EXCEPTION 'Expected 315 imported A-Level 2568 source questions, found %',source_total;
  END IF;

  IF copied_total<>source_total THEN
    RAISE EXCEPTION 'Set 2 expected % questions, found %',source_total,copied_total;
  END IF;

  IF bad_subjects<>0 THEN
    RAISE EXCEPTION 'Set 2 subject counts do not match A-Level 2568 source counts';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- IMPORTANT:
-- Set 2 intentionally remains hidden (is_active=false).
-- After the mixed-response frontend/API is deployed, activate it with:
-- UPDATE public.school_alevel_practice_sets SET is_active=true WHERE set_no=2;
