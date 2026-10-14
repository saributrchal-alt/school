-- Military self-study: individual checks, no countdown and no whole-paper submission.
-- Teacher-administered school_exam_* sessions are not modified by this schema.
BEGIN;
CREATE TABLE IF NOT EXISTS public.school_selftest_answers (
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  set_no integer NOT NULL REFERENCES public.school_practice_sets(set_no),
  question_id text NOT NULL REFERENCES public.school_practice_questions(question_id),
  selected_answer integer NOT NULL CHECK (selected_answer BETWEEN 1 AND 10),
  is_correct boolean NOT NULL,
  elapsed_ms integer NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 86400000),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id,set_no,question_id)
);
CREATE INDEX IF NOT EXISTS school_selftest_answers_member_set ON public.school_selftest_answers(member_id,set_no,checked_at);
ALTER TABLE public.school_selftest_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_selftest_answers FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.school_selftest_answers TO service_role;

CREATE OR REPLACE FUNCTION public.school_selftest_check(
  p_member_id text,
  p_set_no integer,
  p_question_id text,
  p_selected_answer integer,
  p_elapsed_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  q public.school_practice_questions%ROWTYPE;
  a public.school_selftest_answers%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.school_members
   WHERE member_id=p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required'; END IF;
  SELECT q0.* INTO q
  FROM public.school_practice_questions q0
  JOIN public.school_practice_sets s ON s.set_no=q0.set_no AND s.is_active
  WHERE q0.set_no=p_set_no AND q0.question_id=p_question_id;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_available'; END IF;
  IF p_selected_answer IS NULL OR p_selected_answer<1 OR p_selected_answer>jsonb_array_length(q.choices)
      OR p_elapsed_ms IS NULL OR p_elapsed_ms<0 OR p_elapsed_ms>86400000
  THEN RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_answer_or_elapsed_time'; END IF;
  INSERT INTO public.school_selftest_answers
    (member_id,set_no,question_id,selected_answer,is_correct,elapsed_ms,attempt_count,checked_at)
  VALUES (p_member_id,p_set_no,p_question_id,p_selected_answer,(p_selected_answer=q.answer_key),p_elapsed_ms,1,clock_timestamp())
  ON CONFLICT (member_id,set_no,question_id) DO UPDATE
  SET selected_answer=EXCLUDED.selected_answer,
      is_correct=EXCLUDED.is_correct,
      elapsed_ms=EXCLUDED.elapsed_ms,
      attempt_count=public.school_selftest_answers.attempt_count+1,
      checked_at=EXCLUDED.checked_at
  RETURNING * INTO a;
  RETURN jsonb_build_object(
    'question_id',a.question_id,'selected_answer',a.selected_answer,
    'is_correct',a.is_correct,'elapsed_ms',a.elapsed_ms,'attempt_count',a.attempt_count,
    'checked_at',a.checked_at,'answer_key',q.answer_key,
    'explanation',q.explanation,'reasoning',q.reasoning
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.school_selftest_check(text,integer,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_selftest_check(text,integer,text,integer,integer) TO service_role;
COMMIT;
