-- TPAT3 Set 1 support in the existing university exam bank.
-- Schema only: the private 70-question seed and answer bank are delivered separately.
-- Prerequisites: School_ALevel_schema, Set2_Migration and Exam_Sessions installed.
BEGIN;
SET LOCAL standard_conforming_strings = on;

ALTER TABLE public.school_alevel_subjects
  DROP CONSTRAINT IF EXISTS school_alevel_subjects_subject_id_check;
ALTER TABLE public.school_alevel_subjects
  ADD CONSTRAINT school_alevel_subjects_subject_id_check CHECK (subject_id ~ '^(AL[0-9]{2}|TP30)$');
ALTER TABLE public.school_alevel_chapters
  DROP CONSTRAINT IF EXISTS school_alevel_chapters_chapter_id_check;
ALTER TABLE public.school_alevel_chapters
  ADD CONSTRAINT school_alevel_chapters_chapter_id_check CHECK (chapter_id ~ '^(AL[0-9]{2}|TP30)-[0-9]{2}$');
ALTER TABLE public.school_alevel_topics
  DROP CONSTRAINT IF EXISTS school_alevel_topics_topic_id_check;
ALTER TABLE public.school_alevel_topics
  ADD CONSTRAINT school_alevel_topics_topic_id_check CHECK (topic_id ~ '^(AL[0-9]{2}|TP30)-[0-9]{2}\.[0-9]{2}$');
ALTER TABLE public.school_alevel_questions
  DROP CONSTRAINT IF EXISTS school_alevel_questions_question_id_check;
ALTER TABLE public.school_alevel_questions
  ADD CONSTRAINT school_alevel_questions_question_id_check CHECK (question_id ~ '^(AL2568-[0-9]{2}-[0-9]{3}|TPAT3-S01-[0-9]{3})$');

CREATE UNIQUE INDEX IF NOT EXISTS school_tpat3_set_question_number
  ON public.school_alevel_practice_questions(set_no,question_no) WHERE subject_id='TP30';

CREATE OR REPLACE FUNCTION public.school_tpat3_set1_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT count(*)=70 AND count(DISTINCT question_no)=70
    AND bool_and(question_no BETWEEN 1 AND 70 AND jsonb_array_length(choices)=5
      AND question_type='single_choice' AND answer_key BETWEEN 1 AND 5)
    AND count(*) FILTER (WHERE question_no IN
      (5,10,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,42,43,45,47,48,52,54,56,58,60)
      AND question_image_url ~ '^https://media\.nathoeng\.com/uploads/school/[A-Za-z0-9_/-]+\.webp$')=37
  FROM public.school_alevel_practice_questions WHERE subject_id='TP30' AND set_no=1;
$fn$;

CREATE OR REPLACE FUNCTION public.school_tpat3_media_save(p_member_id text,p_question_no integer,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE changed integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id=p_member_id AND is_active AND can_manage FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='school_manager_required'; END IF;
  IF p_question_no IS NULL OR p_question_no NOT IN
    (5,10,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,42,43,45,47,48,52,54,56,58,60)
    OR p_url IS NULL OR length(p_url)>2048
    OR p_url !~ '^https://media\.nathoeng\.com/uploads/school/[A-Za-z0-9_/-]+\.webp$' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_tpat3_image';
  END IF;
  UPDATE public.school_alevel_questions SET question_image_url=p_url
    WHERE subject_id='TP30' AND question_id='TPAT3-S01-'||lpad(p_question_no::text,3,'0');
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE SQLSTATE 'PT404' USING MESSAGE='tpat3_source_not_installed'; END IF;
  UPDATE public.school_alevel_practice_questions SET question_image_url=p_url
    WHERE subject_id='TP30' AND set_no=1 AND question_id='ALP1-TPAT3-S01-'||lpad(p_question_no::text,3,'0');
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE SQLSTATE 'PT404' USING MESSAGE='tpat3_set_not_installed'; END IF;
  RETURN jsonb_build_object('question_no',p_question_no,'url',p_url);
END;
$fn$;

-- A partially installed bank cannot start a practice attempt or a timed exam.
CREATE OR REPLACE FUNCTION public.school_tpat3_guard_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid text; sn integer;
BEGIN
  IF TG_TABLE_NAME='school_alevel_practice_attempts' THEN sid:=NEW.subject_id; sn:=NEW.set_no;
  ELSE SELECT subject_id,set_no INTO sid,sn FROM public.school_alevel_exam_sessions WHERE session_id=NEW.session_id;
  END IF;
  IF sid='TP30' THEN
    IF sn<>1 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='tpat3_set1_required'; END IF;
    IF NOT public.school_tpat3_set1_ready() THEN RAISE SQLSTATE 'PT409' USING MESSAGE='tpat3_images_or_questions_not_ready'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS school_tpat3_practice_guard ON public.school_alevel_practice_attempts;
CREATE TRIGGER school_tpat3_practice_guard BEFORE INSERT ON public.school_alevel_practice_attempts
  FOR EACH ROW EXECUTE FUNCTION public.school_tpat3_guard_attempt();
DROP TRIGGER IF EXISTS school_tpat3_exam_guard ON public.school_alevel_exam_attempts;
CREATE TRIGGER school_tpat3_exam_guard BEFORE INSERT ON public.school_alevel_exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.school_tpat3_guard_attempt();

REVOKE ALL ON FUNCTION public.school_tpat3_set1_ready() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.school_tpat3_media_save(text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.school_tpat3_guard_attempt() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_tpat3_set1_ready(),public.school_tpat3_media_save(text,integer,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
