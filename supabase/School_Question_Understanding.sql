-- Student understanding after viewing a released solution, for both School tracks.
-- Run once in the existing SCHOOL Supabase SQL Editor. Safe to rerun.
-- No questions, answers, scores, or existing learning records are changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_question_understanding (
  track text NOT NULL CHECK (track IN ('military', 'alevel')),
  mode text NOT NULL CHECK (mode IN ('practice', 'exam')),
  attempt_id uuid NOT NULL,
  question_id text NOT NULL CHECK (length(question_id) BETWEEN 1 AND 100),
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  status text NOT NULL CHECK (status IN ('understood', 'needs_help')),
  set_no integer NOT NULL,
  subject_id text NOT NULL,
  topic_id text NOT NULL,
  question_no integer,
  session_id uuid,
  session_title text,
  first_reviewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track, mode, attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS school_understanding_member
  ON public.school_question_understanding(track, member_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_understanding_help
  ON public.school_question_understanding(track, status, updated_at DESC);

ALTER TABLE public.school_question_understanding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_question_understanding FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.school_question_understanding TO service_role;

CREATE OR REPLACE FUNCTION public.school_understanding_save(
  p_member_id text, p_track text, p_mode text, p_attempt_id uuid,
  p_question_id text, p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  prefix text; a record; s record; q record; item public.school_question_understanding%ROWTYPE;
  set_number integer; subject_code text; session_uuid uuid; session_name text;
  result_visible boolean; answer_visible boolean;
BEGIN
  IF p_track IS NULL OR p_track NOT IN ('military', 'alevel')
    OR p_mode IS NULL OR p_mode NOT IN ('practice', 'exam')
    OR p_status IS NULL OR p_status NOT IN ('understood', 'needs_help')
    OR p_question_id IS NULL OR p_question_id !~ '^[A-Za-z0-9_.-]{1,100}$'
    OR p_attempt_id IS NULL THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'invalid_understanding';
  END IF;
  PERFORM 1 FROM public.school_members
    WHERE member_id = p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'study_permission_required'; END IF;
  prefix := CASE WHEN p_track = 'alevel' THEN 'school_alevel' ELSE 'school' END;

  IF p_mode = 'practice' THEN
    EXECUTE format('SELECT * FROM public.%I WHERE attempt_id = $1 AND member_id = $2 FOR SHARE', prefix || '_practice_attempts')
      INTO a USING p_attempt_id, p_member_id;
    IF a.attempt_id IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_owned'; END IF;
    IF a.status <> 'graded' THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'solution_not_released'; END IF;
    set_number := a.set_no; subject_code := a.subject_id;
    EXECUTE format('SELECT set_no FROM public.%I WHERE set_no = $1 AND is_active FOR SHARE', prefix || '_practice_sets')
      INTO s USING set_number;
    IF s.set_no IS NULL THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'set_not_available'; END IF;
  ELSE
    EXECUTE format('SELECT * FROM public.%I WHERE exam_attempt_id = $1 AND member_id = $2 FOR SHARE', prefix || '_exam_attempts')
      INTO a USING p_attempt_id, p_member_id;
    IF a.exam_attempt_id IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_owned'; END IF;
    IF a.status <> 'submitted' THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'exam_not_submitted'; END IF;
    EXECUTE format('SELECT * FROM public.%I WHERE session_id = $1 FOR SHARE', prefix || '_exam_sessions')
      INTO s USING a.session_id;
    IF s.session_id IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'session_not_found'; END IF;
    result_visible := s.result_policy = 'immediate' OR
      (s.result_policy = 'scheduled' AND s.result_release_at IS NOT NULL AND now() >= s.result_release_at);
    answer_visible := (s.answer_policy = 'with_result' AND result_visible) OR
      (s.answer_policy = 'scheduled' AND s.answer_release_at IS NOT NULL AND now() >= s.answer_release_at);
    IF NOT coalesce(answer_visible, false) THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'solution_not_released'; END IF;
    set_number := s.set_no; subject_code := s.subject_id;
    session_uuid := s.session_id; session_name := s.title;
  END IF;

  EXECUTE format('SELECT question_id,subject_id,topic_id,question_no FROM public.%I WHERE question_id = $1 AND set_no = $2 AND ($3::text IS NULL OR subject_id = $3::text) FOR SHARE', prefix || '_practice_questions')
    INTO q USING p_question_id, set_number, subject_code;
  IF q.question_id IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'question_not_in_attempt'; END IF;

  INSERT INTO public.school_question_understanding AS current_item
    (track,mode,attempt_id,question_id,member_id,status,set_no,subject_id,topic_id,question_no,session_id,session_title)
  VALUES (p_track,p_mode,p_attempt_id,p_question_id,p_member_id,p_status,set_number,q.subject_id,q.topic_id,q.question_no,session_uuid,session_name)
  ON CONFLICT (track,mode,attempt_id,question_id) DO UPDATE SET
    status = EXCLUDED.status, set_no = EXCLUDED.set_no, subject_id = EXCLUDED.subject_id,
    topic_id = EXCLUDED.topic_id, question_no = EXCLUDED.question_no,
    session_title = EXCLUDED.session_title, updated_at = clock_timestamp()
  WHERE current_item.member_id = p_member_id
  RETURNING * INTO item;
  IF item.attempt_id IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_owned'; END IF;
  RETURN to_jsonb(item);
END;
$fn$;

REVOKE ALL ON FUNCTION public.school_understanding_save(text,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_understanding_save(text,text,text,uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT true AS passed,
  to_regclass('public.school_question_understanding') IS NOT NULL AS table_ready,
  to_regprocedure('public.school_understanding_save(text,text,text,uuid,text,text)') IS NOT NULL AS function_ready;
