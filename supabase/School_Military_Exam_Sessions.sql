-- Military-prep configurable real exam sessions
-- Supports either one subject or the complete original set.
-- No paid timer/realtime/cron service is required.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE IF NOT EXISTS public.school_exam_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  instructions text,
  set_no integer NOT NULL REFERENCES public.school_practice_sets(set_no),
  subject_id text REFERENCES public.exam_subjects_master(subject_id),

  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  opens_at timestamptz,
  closes_at timestamptz,
  start_policy text NOT NULL DEFAULT 'on_click'
    CHECK (start_policy IN ('on_click','fixed')),
  fixed_start_at timestamptz,

  allow_submit_early boolean NOT NULL DEFAULT true,
  require_all_answers boolean NOT NULL DEFAULT false,
  allow_resume boolean NOT NULL DEFAULT true,
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 10),
  shuffle_questions boolean NOT NULL DEFAULT false,

  result_policy text NOT NULL DEFAULT 'manual'
    CHECK (result_policy IN ('manual','immediate','scheduled')),
  result_release_at timestamptz,

  answer_policy text NOT NULL DEFAULT 'manual'
    CHECK (answer_policy IN ('manual','with_result','scheduled','never')),
  answer_release_at timestamptz,

  audience_mode text NOT NULL DEFAULT 'all_students'
    CHECK (audience_mode IN ('all_students','selected')),

  is_published boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES public.school_members(member_id),
  updated_by text NOT NULL REFERENCES public.school_members(member_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at),
  CHECK (start_policy <> 'fixed' OR fixed_start_at IS NOT NULL),
  CHECK (result_policy <> 'scheduled' OR result_release_at IS NOT NULL),
  CHECK (answer_policy <> 'scheduled' OR answer_release_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS school_exam_sessions_lookup
  ON public.school_exam_sessions(is_published,set_no,subject_id,opens_at,closes_at);

CREATE INDEX IF NOT EXISTS school_exam_sessions_created_by
  ON public.school_exam_sessions(created_by,created_at DESC);

CREATE TABLE IF NOT EXISTS public.school_exam_session_members (
  session_id uuid NOT NULL
    REFERENCES public.school_exam_sessions(session_id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  assigned_by text NOT NULL REFERENCES public.school_members(member_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,member_id)
);

CREATE INDEX IF NOT EXISTS school_exam_session_members_member
  ON public.school_exam_session_members(member_id,session_id);

CREATE TABLE IF NOT EXISTS public.school_exam_attempts (
  exam_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.school_exam_sessions(session_id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  attempt_no integer NOT NULL CHECK (attempt_no BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted')),

  total_count integer NOT NULL CHECK (total_count > 0),
  correct_count integer CHECK (correct_count BETWEEN 0 AND total_count),

  started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  timed_out boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(session_id,member_id,attempt_no),
  CHECK (deadline_at > started_at),
  CHECK (
    (status='draft' AND submitted_at IS NULL AND correct_count IS NULL)
    OR
    (status='submitted' AND submitted_at IS NOT NULL AND correct_count IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS school_exam_attempts_member
  ON public.school_exam_attempts(member_id,session_id,attempt_no DESC);

CREATE INDEX IF NOT EXISTS school_exam_attempts_session
  ON public.school_exam_attempts(session_id,status,submitted_at);

CREATE INDEX IF NOT EXISTS school_exam_attempts_deadline
  ON public.school_exam_attempts(deadline_at)
  WHERE status='draft';

CREATE TABLE IF NOT EXISTS public.school_exam_answers (
  exam_attempt_id uuid NOT NULL
    REFERENCES public.school_exam_attempts(exam_attempt_id) ON DELETE CASCADE,
  question_id text NOT NULL
    REFERENCES public.school_practice_questions(question_id),
  selected_answer integer NOT NULL CHECK (selected_answer BETWEEN 1 AND 10),
  is_correct boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(exam_attempt_id,question_id)
);

CREATE INDEX IF NOT EXISTS school_exam_answers_attempt
  ON public.school_exam_answers(exam_attempt_id,question_id);

ALTER TABLE public.school_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_exam_session_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_exam_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.school_exam_sessions,
  public.school_exam_session_members,
  public.school_exam_attempts,
  public.school_exam_answers
FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.school_exam_sessions,
  public.school_exam_session_members,
  public.school_exam_attempts,
  public.school_exam_answers
TO service_role;

CREATE OR REPLACE FUNCTION public.school_exam_member_allowed
(p_member_id text,p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_exam_sessions s
    JOIN public.school_members m
      ON m.member_id=p_member_id
     AND m.is_active
     AND m.can_study
    WHERE s.session_id=p_session_id
      AND s.is_published
      AND (
        s.audience_mode='all_students'
        OR EXISTS (
          SELECT 1
          FROM public.school_exam_session_members sm
          WHERE sm.session_id=s.session_id
            AND sm.member_id=p_member_id
        )
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.school_exam_submit
(
  p_member_id text,
  p_exam_attempt_id uuid,
  p_timeout boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_exam_attempts%ROWTYPE;
  s public.school_exam_sessions%ROWTYPE;
  answered integer;
  scored integer;
  now_ts timestamptz;
  expired boolean;
BEGIN
  now_ts := clock_timestamp();

  SELECT * INTO a
  FROM public.school_exam_attempts
  WHERE exam_attempt_id=p_exam_attempt_id
    AND member_id=p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='exam_attempt_not_found';
  END IF;

  IF a.status='submitted' THEN
    RETURN to_jsonb(a);
  END IF;

  SELECT * INTO s
  FROM public.school_exam_sessions
  WHERE session_id=a.session_id;

  expired := now_ts >= a.deadline_at;

  IF NOT expired AND p_timeout THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='exam_not_expired';
  END IF;

  IF NOT expired AND NOT s.allow_submit_early THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='early_submit_not_allowed';
  END IF;

  SELECT count(*) INTO answered
  FROM public.school_exam_answers
  WHERE exam_attempt_id=a.exam_attempt_id;

  IF NOT expired
     AND s.require_all_answers
     AND answered<>a.total_count THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE='answer_all_questions';
  END IF;

  UPDATE public.school_exam_answers ans
  SET is_correct=(ans.selected_answer=q.answer_key)
  FROM public.school_practice_questions q
  WHERE ans.exam_attempt_id=a.exam_attempt_id
    AND ans.question_id=q.question_id;

  SELECT count(*) INTO scored
  FROM public.school_exam_answers
  WHERE exam_attempt_id=a.exam_attempt_id
    AND is_correct;

  UPDATE public.school_exam_attempts
  SET status='submitted',
      submitted_at=CASE WHEN expired THEN deadline_at ELSE now_ts END,
      timed_out=expired,
      correct_count=scored,
      updated_at=now_ts
  WHERE exam_attempt_id=a.exam_attempt_id
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_exam_start
(p_member_id text,p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  s public.school_exam_sessions%ROWTYPE;
  a public.school_exam_attempts%ROWTYPE;
  now_ts timestamptz;
  start_ts timestamptz;
  deadline_ts timestamptz;
  question_count integer;
  next_attempt integer;
BEGIN
  now_ts := clock_timestamp();

  IF NOT public.school_exam_member_allowed(p_member_id,p_session_id) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='exam_not_available';
  END IF;

  SELECT * INTO s
  FROM public.school_exam_sessions
  WHERE session_id=p_session_id
  FOR SHARE;

  IF s.opens_at IS NOT NULL AND now_ts < s.opens_at THEN
    RAISE SQLSTATE 'PT425' USING MESSAGE='exam_not_open_yet';
  END IF;

  IF s.closes_at IS NOT NULL AND now_ts >= s.closes_at THEN
    RAISE SQLSTATE 'PT410' USING MESSAGE='exam_closed';
  END IF;

  SELECT * INTO a
  FROM public.school_exam_attempts
  WHERE session_id=p_session_id
    AND member_id=p_member_id
    AND status='draft'
  ORDER BY attempt_no DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF now_ts >= a.deadline_at THEN
      PERFORM public.school_exam_submit(p_member_id,a.exam_attempt_id,true);
      SELECT * INTO a
      FROM public.school_exam_attempts
      WHERE exam_attempt_id=a.exam_attempt_id;
      RETURN to_jsonb(a);
    END IF;

    IF NOT s.allow_resume THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE='resume_not_allowed';
    END IF;

    RETURN to_jsonb(a);
  END IF;

  SELECT COALESCE(max(attempt_no),0)+1 INTO next_attempt
  FROM public.school_exam_attempts
  WHERE session_id=p_session_id
    AND member_id=p_member_id;

  IF next_attempt > s.max_attempts THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='attempt_limit_reached';
  END IF;

  SELECT count(*) INTO question_count
  FROM public.school_practice_questions
  WHERE set_no=s.set_no
    AND (s.subject_id IS NULL OR subject_id=s.subject_id);

  IF question_count=0 THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='exam_question_bank_empty';
  END IF;

  IF s.start_policy='fixed' THEN
    start_ts := s.fixed_start_at;
    IF now_ts < start_ts THEN
      RAISE SQLSTATE 'PT425' USING MESSAGE='fixed_exam_not_started';
    END IF;
  ELSE
    start_ts := now_ts;
  END IF;

  deadline_ts := start_ts + make_interval(mins=>s.duration_minutes);

  IF s.closes_at IS NOT NULL AND deadline_ts > s.closes_at THEN
    deadline_ts := s.closes_at;
  END IF;

  IF deadline_ts <= now_ts THEN
    RAISE SQLSTATE 'PT410' USING MESSAGE='exam_time_window_over';
  END IF;

  INSERT INTO public.school_exam_attempts
  (
    session_id,member_id,attempt_no,total_count,
    started_at,deadline_at
  )
  VALUES
  (
    s.session_id,p_member_id,next_attempt,question_count,
    start_ts,deadline_ts
  )
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_exam_save
(
  p_member_id text,
  p_exam_attempt_id uuid,
  p_question_id text,
  p_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  a public.school_exam_attempts%ROWTYPE;
  s public.school_exam_sessions%ROWTYPE;
  q public.school_practice_questions%ROWTYPE;
  choice_count integer;
  selected integer;
  raw text;
BEGIN
  SELECT * INTO a
  FROM public.school_exam_attempts
  WHERE exam_attempt_id=p_exam_attempt_id
    AND member_id=p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='exam_attempt_not_found';
  END IF;

  IF a.status<>'draft' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='exam_attempt_locked';
  END IF;

  IF clock_timestamp() >= a.deadline_at THEN
    RAISE SQLSTATE 'PT408' USING MESSAGE='exam_time_expired';
  END IF;

  SELECT * INTO s
  FROM public.school_exam_sessions
  WHERE session_id=a.session_id;

  SELECT * INTO q
  FROM public.school_practice_questions
  WHERE question_id=p_question_id
    AND set_no=s.set_no
    AND (s.subject_id IS NULL OR subject_id=s.subject_id);

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_in_exam';
  END IF;

  IF jsonb_typeof(p_response)='number' THEN
    raw := p_response::text;
  ELSIF jsonb_typeof(p_response)='string' THEN
    raw := trim(both '"' from p_response::text);
  ELSE
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
  END IF;

  IF raw !~ '^[0-9]+$' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
  END IF;

  selected := raw::integer;
  choice_count := jsonb_array_length(q.choices);

  IF selected<1 OR selected>choice_count THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
  END IF;

  INSERT INTO public.school_exam_answers
  (
    exam_attempt_id,question_id,selected_answer
  )
  VALUES
  (
    a.exam_attempt_id,p_question_id,selected
  )
  ON CONFLICT(exam_attempt_id,question_id)
  DO UPDATE SET
    selected_answer=EXCLUDED.selected_answer,
    is_correct=NULL,
    updated_at=clock_timestamp();

  UPDATE public.school_exam_attempts
  SET updated_at=clock_timestamp()
  WHERE exam_attempt_id=a.exam_attempt_id;

  RETURN jsonb_build_object(
    'exam_attempt_id',a.exam_attempt_id,
    'question_id',p_question_id,
    'response_value',selected
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.school_exam_member_allowed(text,uuid),
  public.school_exam_start(text,uuid),
  public.school_exam_save(text,uuid,text,jsonb),
  public.school_exam_submit(text,uuid,boolean)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION
  public.school_exam_member_allowed(text,uuid),
  public.school_exam_start(text,uuid),
  public.school_exam_save(text,uuid,text,jsonb),
  public.school_exam_submit(text,uuid,boolean)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT 'school_exam_sessions' AS object_name,count(*) AS row_count
FROM public.school_exam_sessions
UNION ALL
SELECT 'school_exam_attempts',count(*)
FROM public.school_exam_attempts;
