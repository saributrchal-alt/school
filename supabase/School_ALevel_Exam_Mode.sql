-- A-Level Exam Mode (Set 2)
-- No external timer/realtime/cron service is required.
-- The database timestamp is authoritative; the browser only renders the countdown.
BEGIN;
SET LOCAL standard_conforming_strings = on;

ALTER TABLE public.school_alevel_practice_attempts
  ADD COLUMN IF NOT EXISTS exam_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS exam_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS timed_out boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS school_alevel_exam_deadline
  ON public.school_alevel_practice_attempts(exam_deadline_at)
  WHERE set_no=2 AND status='draft';

-- Start/resume:
-- Set 1 behaves exactly as before.
-- Set 2 starts the official clock only once, using the subject duration.
-- Reopening the page never resets the deadline.
CREATE OR REPLACE FUNCTION public.school_alevel_practice_start
(p_member_id text,p_set_no integer,p_subject_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  n integer;
  mins integer;
  ts timestamptz;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_member_id AND is_active AND can_study
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required';
  END IF;

  PERFORM 1
  FROM public.school_alevel_practice_sets
  WHERE set_no=p_set_no AND is_active;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='set_not_available';
  END IF;

  SELECT count(*) INTO n
  FROM public.school_alevel_practice_questions
  WHERE set_no=p_set_no AND subject_id=p_subject_id;
  IF n=0 THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='subject_not_available';
  END IF;

  INSERT INTO public.school_alevel_practice_attempts
    (member_id,set_no,subject_id,total_count)
  VALUES
    (p_member_id,p_set_no,p_subject_id,n)
  ON CONFLICT(member_id,set_no,subject_id) DO NOTHING;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE member_id=p_member_id
    AND set_no=p_set_no
    AND subject_id=p_subject_id
  FOR UPDATE;

  IF p_set_no=2 AND a.status='draft' THEN
    IF a.exam_started_at IS NULL OR a.exam_deadline_at IS NULL THEN
      SELECT duration_minutes INTO mins
      FROM public.school_alevel_subjects
      WHERE subject_id=p_subject_id;

      ts := clock_timestamp();

      UPDATE public.school_alevel_practice_attempts
      SET exam_started_at=ts,
          exam_deadline_at=ts + make_interval(mins=>mins),
          timed_out=false,
          updated_at=ts
      WHERE attempt_id=a.attempt_id
      RETURNING * INTO a;
    ELSIF clock_timestamp() >= a.exam_deadline_at THEN
      UPDATE public.school_alevel_practice_attempts
      SET status='submitted',
          submitted_at=COALESCE(submitted_at,exam_deadline_at),
          timed_out=true,
          updated_at=clock_timestamp()
      WHERE attempt_id=a.attempt_id
      RETURNING * INTO a;
    END IF;
  END IF;

  RETURN to_jsonb(a);
END;
$fn$;

-- Legacy single-choice save remains available for Set 1.
-- If ever called for Set 2, the official deadline is still enforced.
CREATE OR REPLACE FUNCTION public.school_alevel_practice_save
(p_member_id text,p_attempt_id uuid,p_question_id text,p_selected_answer integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  choice_count integer;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_member_id AND is_active AND can_study
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required';
  END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id AND member_id=p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found';
  END IF;
  IF a.status<>'draft' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='attempt_locked';
  END IF;
  IF a.set_no=2
     AND a.exam_deadline_at IS NOT NULL
     AND clock_timestamp() >= a.exam_deadline_at THEN
    RAISE SQLSTATE 'PT408' USING MESSAGE='exam_time_expired';
  END IF;

  SELECT jsonb_array_length(choices) INTO choice_count
  FROM public.school_alevel_practice_questions
  WHERE question_id=p_question_id
    AND set_no=a.set_no
    AND subject_id=a.subject_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_in_attempt';
  END IF;

  IF p_selected_answer IS NULL
     OR p_selected_answer<1
     OR p_selected_answer>choice_count THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
  END IF;

  INSERT INTO public.school_alevel_practice_answers
    (attempt_id,question_id,set_no,subject_id,selected_answer,response_value)
  VALUES
    (a.attempt_id,p_question_id,a.set_no,a.subject_id,p_selected_answer,to_jsonb(p_selected_answer))
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
    'selected_answer',p_selected_answer
  );
END;
$fn$;

-- Mixed response save for Set 2.
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
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required';
  END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id AND member_id=p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found';
  END IF;
  IF a.status<>'draft' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='attempt_locked';
  END IF;
  IF a.set_no=2 AND (
       a.exam_deadline_at IS NULL
       OR clock_timestamp() >= a.exam_deadline_at
     ) THEN
    RAISE SQLSTATE 'PT408' USING MESSAGE='exam_time_expired';
  END IF;

  SELECT * INTO q
  FROM public.school_alevel_practice_questions
  WHERE question_id=p_question_id
    AND set_no=a.set_no
    AND subject_id=a.subject_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_in_attempt';
  END IF;

  IF q.question_type='numeric' THEN
    IF public.school_alevel_json_numeric(p_response) IS NULL THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_numeric_response';
    END IF;
    selected := NULL;

  ELSIF q.question_type='complex'
        AND jsonb_typeof(q.answer_key_json)='object' THEN
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

-- Submit:
-- Set 1 still requires every question answered.
-- Set 2 may be submitted early with unanswered questions; they simply score zero.
-- If the official deadline passed, submitted_at is fixed to the deadline and timed_out=true.
CREATE OR REPLACE FUNCTION public.school_alevel_practice_submit
(p_member_id text,p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  n integer;
  answered integer;
  expired boolean;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_member_id AND is_active AND can_study
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required';
  END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id AND member_id=p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found';
  END IF;
  IF a.status IN ('submitted','graded') THEN
    RETURN to_jsonb(a);
  END IF;

  SELECT count(*) INTO n
  FROM public.school_alevel_practice_questions
  WHERE set_no=a.set_no AND subject_id=a.subject_id;

  SELECT count(*) INTO answered
  FROM public.school_alevel_practice_answers
  WHERE attempt_id=a.attempt_id;

  IF n<>a.total_count THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='question_bank_changed';
  END IF;

  IF a.set_no<>2 AND answered<>n THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='answer_all_questions';
  END IF;

  IF a.set_no=2 AND (a.exam_started_at IS NULL OR a.exam_deadline_at IS NULL) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='exam_not_started';
  END IF;

  expired := a.set_no=2 AND clock_timestamp() >= a.exam_deadline_at;

  UPDATE public.school_alevel_practice_attempts
  SET status='submitted',
      submitted_at=CASE WHEN expired THEN exam_deadline_at ELSE clock_timestamp() END,
      timed_out=expired,
      updated_at=clock_timestamp()
  WHERE attempt_id=a.attempt_id
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$fn$;

-- Grade:
-- Set 2 accepts unanswered questions as incorrect, like a real exam.
CREATE OR REPLACE FUNCTION public.school_alevel_practice_grade
(p_grader_id text,p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_alevel_practice_attempts%ROWTYPE;
  answer_count integer;
  bank_count integer;
  scored integer;
BEGIN
  PERFORM 1
  FROM public.school_members
  WHERE member_id=p_grader_id AND is_active AND can_manage
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='manage_permission_required';
  END IF;

  SELECT * INTO a
  FROM public.school_alevel_practice_attempts
  WHERE attempt_id=p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found';
  END IF;
  IF a.status='graded' THEN
    RETURN to_jsonb(a);
  END IF;
  IF a.status<>'submitted' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='submit_before_grade';
  END IF;

  SELECT count(*) INTO answer_count
  FROM public.school_alevel_practice_answers
  WHERE attempt_id=a.attempt_id;

  SELECT count(*) INTO bank_count
  FROM public.school_alevel_practice_questions
  WHERE set_no=a.set_no AND subject_id=a.subject_id;

  IF bank_count<>a.total_count THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='question_bank_changed';
  END IF;

  IF a.set_no<>2 AND answer_count<>a.total_count THEN
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
      graded_at=clock_timestamp(),
      graded_by=p_grader_id,
      updated_at=clock_timestamp()
  WHERE attempt_id=a.attempt_id
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.school_alevel_practice_start(text,integer,text),
  public.school_alevel_practice_save(text,uuid,text,integer),
  public.school_alevel_practice_save_v2(text,uuid,text,jsonb),
  public.school_alevel_practice_submit(text,uuid),
  public.school_alevel_practice_grade(text,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION
  public.school_alevel_practice_start(text,integer,text),
  public.school_alevel_practice_save(text,uuid,text,integer),
  public.school_alevel_practice_save_v2(text,uuid,text,jsonb),
  public.school_alevel_practice_submit(text,uuid),
  public.school_alevel_practice_grade(text,uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verification
SELECT subject_id,subject_name_th,duration_minutes
FROM public.school_alevel_subjects
ORDER BY sort_order;
