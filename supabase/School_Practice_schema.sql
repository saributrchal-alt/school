-- School practice schema only. No live questions or answer bank is published here.
-- Run the separately delivered PRIVATE School_Practice_Set1.sql to install set 1.
-- Requires the existing School_2562_2563.sql tables. Safe to rerun; no data is deleted.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE IF NOT EXISTS public.school_practice_sets (
  set_no integer PRIMARY KEY CHECK (set_no BETWEEN 1 AND 10),
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_practice_questions (
  question_id text PRIMARY KEY,
  set_no integer NOT NULL REFERENCES public.school_practice_sets(set_no),
  topic_id text NOT NULL REFERENCES public.exam_topics(topic_id),
  subject_id text NOT NULL REFERENCES public.exam_subjects_master(subject_id),
  sort_order integer NOT NULL CHECK (sort_order > 0),
  prompt text NOT NULL CHECK (length(prompt) > 0),
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 5),
  answer_key integer NOT NULL CHECK (answer_key BETWEEN 1 AND 5),
  explanation text NOT NULL CHECK (length(explanation) > 0),
  reasoning text NOT NULL CHECK (length(reasoning) > 0),
  source_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_no, topic_id),
  UNIQUE (question_id, set_no, subject_id),
  CHECK (left(topic_id, length(subject_id) + 1) = subject_id || '-')
);

CREATE TABLE IF NOT EXISTS public.school_practice_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  set_no integer NOT NULL REFERENCES public.school_practice_sets(set_no),
  subject_id text NOT NULL REFERENCES public.exam_subjects_master(subject_id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'graded')),
  total_count integer NOT NULL CHECK (total_count > 0),
  correct_count integer CHECK (correct_count BETWEEN 0 AND total_count),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by text REFERENCES public.school_members(member_id),
  UNIQUE (member_id, set_no, subject_id),
  UNIQUE (attempt_id, set_no, subject_id),
  CHECK (
    (status = 'draft' AND submitted_at IS NULL AND graded_at IS NULL AND graded_by IS NULL AND correct_count IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND graded_at IS NULL AND graded_by IS NULL AND correct_count IS NULL)
    OR (status = 'graded' AND submitted_at IS NOT NULL AND graded_at IS NOT NULL AND graded_by IS NOT NULL AND correct_count IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.school_practice_answers (
  attempt_id uuid NOT NULL,
  question_id text NOT NULL,
  set_no integer NOT NULL,
  subject_id text NOT NULL,
  selected_answer integer NOT NULL CHECK (selected_answer BETWEEN 1 AND 10),
  is_correct boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, set_no, subject_id)
    REFERENCES public.school_practice_attempts(attempt_id, set_no, subject_id),
  FOREIGN KEY (question_id, set_no, subject_id)
    REFERENCES public.school_practice_questions(question_id, set_no, subject_id)
);

CREATE INDEX IF NOT EXISTS school_practice_question_order
  ON public.school_practice_questions(set_no, subject_id, sort_order, topic_id);
CREATE INDEX IF NOT EXISTS school_practice_review_queue
  ON public.school_practice_attempts(submitted_at) WHERE status = 'submitted';

ALTER TABLE public.school_practice_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_practice_answers ENABLE ROW LEVEL SECURITY;

-- Only the backend reads these tables. Writes go through the transactions below.
REVOKE ALL ON public.school_practice_sets, public.school_practice_questions,
  public.school_practice_attempts, public.school_practice_answers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.school_practice_sets, public.school_practice_questions,
  public.school_practice_attempts, public.school_practice_answers TO service_role;

CREATE OR REPLACE FUNCTION public.school_practice_start(p_member_id text, p_set_no integer, p_subject_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE a public.school_practice_attempts%ROWTYPE; n integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id = p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'study_permission_required'; END IF;
  PERFORM 1 FROM public.school_practice_sets WHERE set_no = p_set_no AND is_active;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'set_not_available'; END IF;
  SELECT count(*) INTO n FROM public.school_practice_questions WHERE set_no = p_set_no AND subject_id = p_subject_id;
  IF n = 0 THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'subject_not_available'; END IF;
  INSERT INTO public.school_practice_attempts(member_id, set_no, subject_id, total_count)
    VALUES (p_member_id, p_set_no, p_subject_id, n) ON CONFLICT (member_id, set_no, subject_id) DO NOTHING;
  SELECT * INTO a FROM public.school_practice_attempts
    WHERE member_id = p_member_id AND set_no = p_set_no AND subject_id = p_subject_id;
  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_practice_save(p_member_id text, p_attempt_id uuid, p_question_id text, p_selected_answer integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE a public.school_practice_attempts%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id = p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'study_permission_required'; END IF;
  SELECT * INTO a FROM public.school_practice_attempts
    WHERE attempt_id = p_attempt_id AND member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_found'; END IF;
  IF a.status <> 'draft' THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'attempt_locked'; END IF;
  IF p_selected_answer IS NULL OR p_selected_answer NOT BETWEEN 1 AND 5 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'invalid_choice';
  END IF;
  PERFORM 1 FROM public.school_practice_questions
    WHERE question_id = p_question_id AND set_no = a.set_no AND subject_id = a.subject_id;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'question_not_in_attempt'; END IF;
  INSERT INTO public.school_practice_answers(attempt_id, question_id, set_no, subject_id, selected_answer)
    VALUES (a.attempt_id, p_question_id, a.set_no, a.subject_id, p_selected_answer)
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_answer = EXCLUDED.selected_answer, is_correct = NULL, updated_at = now();
  UPDATE public.school_practice_attempts SET updated_at = now() WHERE attempt_id = a.attempt_id;
  RETURN jsonb_build_object('attempt_id', a.attempt_id, 'question_id', p_question_id, 'selected_answer', p_selected_answer);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_practice_submit(p_member_id text, p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE a public.school_practice_attempts%ROWTYPE; n integer; answered integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id = p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'study_permission_required'; END IF;
  SELECT * INTO a FROM public.school_practice_attempts
    WHERE attempt_id = p_attempt_id AND member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_found'; END IF;
  IF a.status IN ('submitted', 'graded') THEN RETURN to_jsonb(a); END IF;
  SELECT count(*) INTO n FROM public.school_practice_questions WHERE set_no = a.set_no AND subject_id = a.subject_id;
  SELECT count(*) INTO answered FROM public.school_practice_answers WHERE attempt_id = a.attempt_id;
  IF n <> a.total_count THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'question_bank_changed'; END IF;
  IF answered <> n THEN RAISE SQLSTATE 'PT422' USING MESSAGE = 'answer_all_questions'; END IF;
  UPDATE public.school_practice_attempts SET status = 'submitted', submitted_at = now(), updated_at = now()
    WHERE attempt_id = a.attempt_id RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_practice_grade(p_grader_id text, p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE a public.school_practice_attempts%ROWTYPE; n integer; scored integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id = p_grader_id AND is_active AND can_manage FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'manage_permission_required'; END IF;
  SELECT * INTO a FROM public.school_practice_attempts WHERE attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'attempt_not_found'; END IF;
  IF a.status = 'graded' THEN RETURN to_jsonb(a); END IF;
  IF a.status <> 'submitted' THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'submit_before_grade'; END IF;
  SELECT count(*) INTO n FROM public.school_practice_answers WHERE attempt_id = a.attempt_id;
  IF n <> a.total_count OR a.total_count <> (SELECT count(*) FROM public.school_practice_questions
      WHERE set_no = a.set_no AND subject_id = a.subject_id) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'question_bank_changed';
  END IF;
  UPDATE public.school_practice_answers AS ans SET is_correct = (ans.selected_answer = q.answer_key)
    FROM public.school_practice_questions AS q
    WHERE ans.attempt_id = a.attempt_id AND ans.question_id = q.question_id;
  SELECT count(*) INTO scored FROM public.school_practice_answers WHERE attempt_id = a.attempt_id AND is_correct;
  UPDATE public.school_practice_attempts SET status = 'graded', correct_count = scored,
    graded_at = now(), graded_by = p_grader_id, updated_at = now()
    WHERE attempt_id = a.attempt_id RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$fn$;

REVOKE ALL ON FUNCTION public.school_practice_start(text, integer, text),
  public.school_practice_save(text, uuid, text, integer), public.school_practice_submit(text, uuid),
  public.school_practice_grade(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_practice_start(text, integer, text),
  public.school_practice_save(text, uuid, text, integer), public.school_practice_submit(text, uuid),
  public.school_practice_grade(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
