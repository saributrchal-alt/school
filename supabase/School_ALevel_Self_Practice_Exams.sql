-- Seven self-service A-Level timed exams. Safe to re-run; no existing attempts are modified.
INSERT INTO public.school_alevel_exam_sessions (
 title,instructions,subject_id,set_no,duration_minutes,opens_at,closes_at,start_policy,fixed_start_at,
 allow_submit_early,require_all_answers,allow_resume,max_attempts,shuffle_questions,result_policy,
 result_release_at,answer_policy,answer_release_at,audience_mode,is_published,created_by,updated_by
)
SELECT 'ฝึกสอบเสมือนจริง A-Level · '||s.subject_name_th,
 'ข้อสอบ A-Level ชุด 2 จับเวลา 90 นาที ไม่หยุดเวลาเมื่อปิดหน้า ส่งแล้วตรวจคะแนนและเปิดเฉลยทันที',
 s.subject_id,2,s.duration_minutes,NULL,NULL,'on_click',NULL,
 true,false,true,10,false,'immediate',NULL,'with_result',NULL,'all_students',true,owner.member_id,owner.member_id
FROM public.school_alevel_subjects s
CROSS JOIN (SELECT member_id FROM public.school_members WHERE can_manage=true AND is_active=true ORDER BY member_id LIMIT 1) owner
WHERE s.subject_id IN ('AL61','AL64','AL65','AL66','AL82','AL81','AL70')
 AND EXISTS (SELECT 1 FROM public.school_alevel_practice_questions q WHERE q.subject_id=s.subject_id AND q.set_no=2)
 AND NOT EXISTS (SELECT 1 FROM public.school_alevel_exam_sessions e WHERE e.subject_id=s.subject_id AND e.title LIKE 'ฝึกสอบเสมือนจริง A-Level · %');
