-- NATHOENG SCHOOL · Zoom live classes (link-based MVP).
-- Install in the existing School Supabase project before enabling the UI.
-- Does not modify exam/practice tables or install any public answer keys.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_live_classes (
  class_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  teacher_id text NOT NULL REFERENCES public.school_members(member_id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  zoom_join_url text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_live_class_duration CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '8 hours')
);

CREATE TABLE IF NOT EXISTS public.school_live_enrollments (
  class_id uuid NOT NULL REFERENCES public.school_live_classes(class_id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, member_id)
);

-- This records the first time a learner clicked 'join' on School.
-- It does not prove that the learner joined Zoom or remained in the call.
CREATE TABLE IF NOT EXISTS public.school_live_join_clicks (
  class_id uuid NOT NULL,
  member_id text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, member_id),
  FOREIGN KEY (class_id, member_id)
    REFERENCES public.school_live_enrollments(class_id, member_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS school_live_classes_start_idx
  ON public.school_live_classes(starts_at DESC);
CREATE INDEX IF NOT EXISTS school_live_enrollments_member_idx
  ON public.school_live_enrollments(member_id, class_id);

ALTER TABLE public.school_live_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_live_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_live_join_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_live_classes, public.school_live_enrollments, public.school_live_join_clicks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_live_classes,
  public.school_live_enrollments, public.school_live_join_clicks TO service_role;

-- Atomic save: validate permissions, validate roster, and replace the roster together.
CREATE OR REPLACE FUNCTION public.school_live_save(
  p_actor_id text,
  p_class_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_zoom_join_url text,
  p_student_ids text[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id uuid;
  v_is_manager boolean;
  v_students text[];
  v_count integer;
BEGIN
  SELECT can_manage INTO v_is_manager
  FROM public.school_members
  WHERE member_id = p_actor_id AND is_active AND (can_teach OR can_manage);
  IF NOT FOUND THEN RAISE EXCEPTION 'school live: instructor not authorized' USING ERRCODE='PT403'; END IF;

  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 160
     OR p_starts_at IS NULL OR p_ends_at IS NULL
     OR p_ends_at <= p_starts_at OR p_ends_at > p_starts_at + interval '8 hours'
     OR p_zoom_join_url IS NULL OR char_length(p_zoom_join_url) > 2000
     OR p_zoom_join_url !~ '^https://([a-z0-9-]+[.])*zoom[.]us/j/[0-9]{9,13}([?][^#[:space:]]*)?$'
  THEN RAISE EXCEPTION 'school live: invalid class details' USING ERRCODE='PT400'; END IF;

  SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::text[])
    INTO v_students FROM unnest(coalesce(p_student_ids, ARRAY[]::text[])) id;
  IF coalesce(array_length(v_students, 1), 0) > 100
  THEN RAISE EXCEPTION 'school live: too many students' USING ERRCODE='PT400'; END IF;
  SELECT count(*) INTO v_count FROM public.school_members
    WHERE member_id = ANY(v_students) AND is_active AND can_study;
  IF v_count <> coalesce(array_length(v_students, 1), 0)
  THEN RAISE EXCEPTION 'school live: invalid student list' USING ERRCODE='PT400'; END IF;

  IF p_class_id IS NULL THEN
    INSERT INTO public.school_live_classes(title, teacher_id, starts_at, ends_at, zoom_join_url)
    VALUES (btrim(p_title), p_actor_id, p_starts_at, p_ends_at, p_zoom_join_url)
    RETURNING class_id INTO v_class_id;
  ELSE
    UPDATE public.school_live_classes
      SET title=btrim(p_title), starts_at=p_starts_at, ends_at=p_ends_at,
          zoom_join_url=p_zoom_join_url, updated_at=now()
    WHERE class_id=p_class_id AND status='scheduled'
      AND (teacher_id=p_actor_id OR v_is_manager)
    RETURNING class_id INTO v_class_id;
    IF v_class_id IS NULL
    THEN RAISE EXCEPTION 'school live: class not found or not owned' USING ERRCODE='PT403'; END IF;
  END IF;

  DELETE FROM public.school_live_enrollments
    WHERE class_id=v_class_id AND NOT (member_id=ANY(v_students));
  INSERT INTO public.school_live_enrollments(class_id, member_id)
    SELECT v_class_id, id FROM unnest(v_students) AS id
    ON CONFLICT (class_id, member_id) DO NOTHING;
  RETURN v_class_id;
END;
$$;

REVOKE ALL ON FUNCTION public.school_live_save(text,uuid,text,timestamptz,timestamptz,text,text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_live_save(text,uuid,text,timestamptz,timestamptz,text,text[])
  TO service_role;

COMMIT;
