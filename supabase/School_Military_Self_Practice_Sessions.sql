-- Idempotent setup of independently marked military self-tests.
-- Existing real exam sessions and submitted attempts remain unchanged.
-- This reuses the server-validated exam RPCs and their automatic answer release.
INSERT INTO public.school_exam_sessions (
 title,instructions,set_no,subject_id,duration_minutes,opens_at,closes_at,
 start_policy,fixed_start_at,allow_submit_early,require_all_answers,allow_resume,
 max_attempts,shuffle_questions,result_policy,result_release_at,answer_policy,
 answer_release_at,audience_mode,is_published,created_by,updated_by
)
SELECT
 'ฝึกทดสอบตนเอง · ' || coalesce(nullif(trim(s.display_label),''),s.label),
 'แบบทดสอบทุกวิชาในชุดเดียว เลือกตอบข้อไหนก่อนก็ได้ ส่งแล้วตรวจและเปิดเฉลยทันที ใช้เวลาสูงสุด 10 ชั่วโมง ไม่ใช่รอบสอบจริงที่ครูจัด',
 s.set_no,NULL,600,NULL,NULL,'on_click',NULL,
 true,false,true,10,false,'immediate',NULL,'with_result',NULL,
 'all_students',true,admin.member_id,admin.member_id
FROM public.school_practice_sets s
CROSS JOIN (
 SELECT member_id FROM public.school_members
 WHERE is_active=true AND can_manage=true ORDER BY member_id LIMIT 1
) admin
WHERE s.is_active=true
 AND EXISTS (SELECT 1 FROM public.school_practice_questions q WHERE q.set_no=s.set_no)
 AND NOT EXISTS (
   SELECT 1 FROM public.school_practice_questions q
   WHERE q.set_no=s.set_no AND (q.answer_key IS NULL OR nullif(trim(q.explanation),'') IS NULL)
 )
 AND NOT EXISTS (
   SELECT 1 FROM public.school_exam_sessions e
   WHERE e.set_no=s.set_no AND e.subject_id IS NULL
     AND e.title LIKE 'ฝึกทดสอบตนเอง · %'
 );
