-- A-Level track for Nathoeng School
-- Separate from the existing military-prep tables so the จปร. workflow is not changed.
-- Safe to rerun. Run after School_2562_2563.sql because progress references school_members.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE IF NOT EXISTS public.school_alevel_subjects (
  subject_id text PRIMARY KEY CHECK (subject_id ~ '^AL[0-9]{2}$'),
  subject_code integer NOT NULL UNIQUE,
  subject_name_th text NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  source_question_count_2568 integer NOT NULL CHECK (source_question_count_2568 >= 0),
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes > 0)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_sources (
  source_id text PRIMARY KEY,
  year_be integer NOT NULL CHECK (year_be BETWEEN 2500 AND 2700),
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  filename text NOT NULL,
  pdf_page_count integer NOT NULL CHECK (pdf_page_count > 0),
  question_count integer NOT NULL CHECK (question_count > 0),
  source_title text NOT NULL,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year_be, subject_id)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_chapters (
  chapter_id text PRIMARY KEY CHECK (chapter_id ~ '^AL[0-9]{2}-[0-9]{2}$'),
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  chapter_name_th text NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  UNIQUE(subject_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_topics (
  topic_id text PRIMARY KEY CHECK (topic_id ~ '^AL[0-9]{2}-[0-9]{2}\.[0-9]{2}$'),
  chapter_id text NOT NULL REFERENCES public.school_alevel_chapters(chapter_id),
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  topic_name_th text NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  UNIQUE(chapter_id, sort_order),
  CHECK (left(topic_id, 4) = subject_id)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_questions (
  question_id text PRIMARY KEY CHECK (question_id ~ '^AL2568-[0-9]{2}-[0-9]{3}$'),
  source_id text NOT NULL REFERENCES public.school_alevel_sources(source_id),
  year_be integer NOT NULL DEFAULT 2568,
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  question_no integer NOT NULL CHECK (question_no > 0),
  primary_topic_id text NOT NULL REFERENCES public.school_alevel_topics(topic_id),
  question_type text NOT NULL DEFAULT 'single_choice'
    CHECK (question_type IN ('single_choice','numeric','complex')),
  prompt text NOT NULL CHECK (length(btrim(prompt)) > 0),
  choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices)='array'),
  answer_key jsonb,
  explanation text,
  reasoning text,
  question_image_url text,
  source_page integer NOT NULL CHECK (source_page > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, question_no),
  CHECK (left(primary_topic_id, 4) = subject_id)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_topic_progress (
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  topic_id text NOT NULL REFERENCES public.school_alevel_topics(topic_id),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','review','completed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, topic_id)
);

CREATE INDEX IF NOT EXISTS school_alevel_questions_topic_idx
  ON public.school_alevel_questions(primary_topic_id, year_be, question_no);
CREATE INDEX IF NOT EXISTS school_alevel_questions_subject_idx
  ON public.school_alevel_questions(subject_id, year_be, question_no);
CREATE INDEX IF NOT EXISTS school_alevel_topic_progress_member_idx
  ON public.school_alevel_topic_progress(member_id, status);

ALTER TABLE public.school_alevel_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_topic_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_alevel_subjects, public.school_alevel_sources,
  public.school_alevel_chapters, public.school_alevel_topics,
  public.school_alevel_questions, public.school_alevel_topic_progress
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.school_alevel_topic_progress TO service_role;
GRANT SELECT ON public.school_alevel_subjects, public.school_alevel_sources,
  public.school_alevel_chapters, public.school_alevel_topics,
  public.school_alevel_questions TO service_role;

INSERT INTO public.school_alevel_subjects
(subject_id,subject_code,subject_name_th,sort_order,source_question_count_2568,duration_minutes) VALUES
('AL61',61,'คณิตศาสตร์ประยุกต์ 1',1,30,90),
('AL64',64,'ฟิสิกส์',2,30,90),
('AL65',65,'เคมี',3,35,90),
('AL66',66,'ชีววิทยา',4,40,90),
('AL82',82,'ภาษาอังกฤษ',5,80,90),
('AL81',81,'ภาษาไทย',6,50,90),
('AL70',70,'สังคมศึกษา',7,50,90)
ON CONFLICT (subject_id) DO UPDATE SET
  subject_code=EXCLUDED.subject_code, subject_name_th=EXCLUDED.subject_name_th,
  sort_order=EXCLUDED.sort_order, source_question_count_2568=EXCLUDED.source_question_count_2568,
  duration_minutes=EXCLUDED.duration_minutes;

INSERT INTO public.school_alevel_sources
(source_id,year_be,subject_id,filename,pdf_page_count,question_count,source_title,source_url) VALUES
('AL2568-61',2568,'AL61','tcas68-math1-a-level.pdf',21,30,'A-Level 61 คณิตศาสตร์ประยุกต์ 1 พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-math1-a-level.pdf'),
('AL2568-64',2568,'AL64','tcas68-phy-a-level.pdf',23,30,'A-Level 64 ฟิสิกส์ พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-phy-a-level.pdf'),
('AL2568-65',2568,'AL65','tcas68-chem-a-level.pdf',27,35,'A-Level 65 เคมี พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-chem-a-level.pdf'),
('AL2568-66',2568,'AL66','tcas68-bio-a-level.pdf',36,40,'A-Level 66 ชีววิทยา พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-bio-a-level.pdf'),
('AL2568-82',2568,'AL82','tcas68-eng-a-level.pdf',37,80,'A-Level 82 ภาษาอังกฤษ พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-eng-a-level.pdf'),
('AL2568-81',2568,'AL81','tcas68-thai-a-level.pdf',23,50,'A-Level 81 ภาษาไทย พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-thai-a-level.pdf'),
('AL2568-70',2568,'AL70','tcas68-soc-a-level.pdf',27,50,'A-Level 70 สังคมศึกษา พ.ศ. 2568','https://assets.mytcas.com/68/answer/tcas68-soc-a-level.pdf')
ON CONFLICT (source_id) DO UPDATE SET
  filename=EXCLUDED.filename,pdf_page_count=EXCLUDED.pdf_page_count,question_count=EXCLUDED.question_count,
  source_title=EXCLUDED.source_title,source_url=EXCLUDED.source_url;

INSERT INTO public.school_alevel_chapters (chapter_id,subject_id,chapter_name_th,sort_order) VALUES
('AL61-01','AL61','เซตและตรรกศาสตร์',1),
('AL61-02','AL61','จำนวนจริง พหุนาม และสมการ',2),
('AL61-03','AL61','ฟังก์ชัน เอกซ์โพเนนเชียล และลอการิทึม',3),
('AL61-04','AL61','ตรีโกณมิติ',4),
('AL61-05','AL61','เมทริกซ์',5),
('AL61-06','AL61','จำนวนเชิงซ้อน',6),
('AL61-07','AL61','เวกเตอร์ในสามมิติ',7),
('AL61-08','AL61','ลำดับและอนุกรม',8),
('AL61-09','AL61','เรขาคณิตวิเคราะห์และภาคตัดกรวย',9),
('AL61-10','AL61','หลักการนับและความน่าจะเป็น',10),
('AL61-11','AL61','สถิติและการแจกแจงความน่าจะเป็น',11),
('AL61-12','AL61','แคลคูลัส',12),

('AL64-01','AL64','กลศาสตร์',1),
('AL64-02','AL64','สมบัติเชิงกลของสสารและความร้อน',2),
('AL64-03','AL64','คลื่น เสียง และแสง',3),
('AL64-04','AL64','ไฟฟ้าและแม่เหล็ก',4),
('AL64-05','AL64','ฟิสิกส์อะตอมและนิวเคลียร์',5),

('AL65-01','AL65','อะตอมและสมบัติของธาตุ',1),
('AL65-02','AL65','พันธะเคมี',2),
('AL65-03','AL65','โมลและปริมาณสารสัมพันธ์',3),
('AL65-04','AL65','แก๊ส',4),
('AL65-05','AL65','สารละลาย',5),
('AL65-06','AL65','อัตราการเกิดปฏิกิริยาเคมี',6),
('AL65-07','AL65','สมดุลเคมี',7),
('AL65-08','AL65','กรด-เบส',8),
('AL65-09','AL65','เคมีไฟฟ้า',9),
('AL65-10','AL65','เคมีอินทรีย์',10),
('AL65-11','AL65','พอลิเมอร์และการประยุกต์',11),

('AL66-01','AL66','ความหลากหลายทางชีวภาพและนิเวศวิทยา',1),
('AL66-02','AL66','เซลล์และชีวโมเลกุล',2),
('AL66-03','AL66','พืช',3),
('AL66-04','AL66','พันธุศาสตร์ วิวัฒนาการ และเทคโนโลยีชีวภาพ',4),
('AL66-05','AL66','ระบบร่างกายสัตว์และมนุษย์',5),

('AL82-01','AL82','Listening and Speaking Skills',1),
('AL82-02','AL82','Reading Skill',2),
('AL82-03','AL82','Writing Skill',3),

('AL81-01','AL81','การอ่าน',1),
('AL81-02','AL81','การเขียน',2),
('AL81-03','AL81','การพูดและการฟัง',3),
('AL81-04','AL81','หลักการใช้ภาษา',4),

('AL70-01','AL70','ศาสนา ศีลธรรม และจริยธรรม',1),
('AL70-02','AL70','หน้าที่พลเมือง วัฒนธรรม และการดำเนินชีวิตในสังคม',2),
('AL70-03','AL70','เศรษฐศาสตร์',3),
('AL70-04','AL70','ประวัติศาสตร์',4),
('AL70-05','AL70','ภูมิศาสตร์',5)
ON CONFLICT (chapter_id) DO UPDATE SET chapter_name_th=EXCLUDED.chapter_name_th,sort_order=EXCLUDED.sort_order;

INSERT INTO public.school_alevel_topics (topic_id,chapter_id,subject_id,topic_name_th,sort_order) VALUES
('AL61-01.01','AL61-01','AL61','เซตและเพาเวอร์เซต',1),
('AL61-01.02','AL61-01','AL61','ตรรกศาสตร์และค่าความจริง',2),
('AL61-02.01','AL61-02','AL61','พหุนามและทฤษฎีตัวประกอบ',1),
('AL61-02.02','AL61-02','AL61','สมการและอสมการ',2),
('AL61-03.01','AL61-03','AL61','ความสัมพันธ์และฟังก์ชัน',1),
('AL61-03.02','AL61-03','AL61','ฟังก์ชันเอกซ์โพเนนเชียลและลอการิทึม',2),
('AL61-04.01','AL61-04','AL61','ฟังก์ชันตรีโกณมิติและเอกลักษณ์',1),
('AL61-05.01','AL61-05','AL61','เมทริกซ์และระบบสมการเชิงเส้น',1),
('AL61-05.02','AL61-05','AL61','ดีเทอร์มิแนนต์',2),
('AL61-06.01','AL61-06','AL61','จำนวนเชิงซ้อน',1),
('AL61-07.01','AL61-07','AL61','เวกเตอร์และเรขาคณิตสามมิติ',1),
('AL61-08.01','AL61-08','AL61','ลำดับและอนุกรม',1),
('AL61-08.02','AL61-08','AL61','ดอกเบี้ยและมูลค่าเงิน',2),
('AL61-09.01','AL61-09','AL61','เรขาคณิตวิเคราะห์',1),
('AL61-09.02','AL61-09','AL61','ภาคตัดกรวย',2),
('AL61-10.01','AL61-10','AL61','หลักการนับ',1),
('AL61-10.02','AL61-10','AL61','ความน่าจะเป็น',2),
('AL61-11.01','AL61-11','AL61','สถิติเชิงพรรณนา',1),
('AL61-11.02','AL61-11','AL61','ตัวแปรสุ่มและการแจกแจงความน่าจะเป็น',2),
('AL61-12.01','AL61-12','AL61','ลิมิตและความต่อเนื่อง',1),
('AL61-12.02','AL61-12','AL61','อนุพันธ์และการประยุกต์',2),
('AL61-12.03','AL61-12','AL61','ปริพันธ์และการประยุกต์',3),

('AL64-01.01','AL64-01','AL64','การเคลื่อนที่แนวตรงและโพรเจกไทล์',1),
('AL64-01.02','AL64-01','AL64','แรงและกฎการเคลื่อนที่',2),
('AL64-01.03','AL64-01','AL64','สมดุลกลและโมเมนต์',3),
('AL64-01.04','AL64-01','AL64','งาน พลังงาน และกำลัง',4),
('AL64-01.05','AL64-01','AL64','โมเมนตัมและการชน',5),
('AL64-01.06','AL64-01','AL64','การเคลื่อนที่แบบวงกลมและแรงโน้มถ่วง',6),
('AL64-02.01','AL64-02','AL64','ของแข็ง ของไหล และความดัน',1),
('AL64-02.02','AL64-02','AL64','ความร้อนและทฤษฎีจลน์ของแก๊ส',2),
('AL64-03.01','AL64-03','AL64','การสั่นและคลื่น',1),
('AL64-03.02','AL64-03','AL64','เสียง',2),
('AL64-03.03','AL64-03','AL64','แสงเชิงรังสีและแสงเชิงคลื่น',3),
('AL64-04.01','AL64-04','AL64','ไฟฟ้าสถิต',1),
('AL64-04.02','AL64-04','AL64','ไฟฟ้ากระแส',2),
('AL64-04.03','AL64-04','AL64','แม่เหล็กและการเหนี่ยวนำแม่เหล็กไฟฟ้า',3),
('AL64-05.01','AL64-05','AL64','ฟิสิกส์อะตอม',1),
('AL64-05.02','AL64-05','AL64','ฟิสิกส์นิวเคลียร์และอนุภาค',2),

('AL65-01.01','AL65-01','AL65','โครงสร้างอะตอมและสเปกตรัม',1),
('AL65-01.02','AL65-01','AL65','ตารางธาตุและสมบัติธาตุ',2),
('AL65-02.01','AL65-02','AL65','พันธะและรูปร่างโมเลกุล',1),
('AL65-02.02','AL65-02','AL65','แรงยึดเหนี่ยวระหว่างโมเลกุล',2),
('AL65-03.01','AL65-03','AL65','โมล สูตรเคมี และปริมาณสารสัมพันธ์',1),
('AL65-04.01','AL65-04','AL65','กฎแก๊สและทฤษฎีจลน์',1),
('AL65-05.01','AL65-05','AL65','ความเข้มข้นและสมบัติของสารละลาย',1),
('AL65-06.01','AL65-06','AL65','อัตราการเกิดปฏิกิริยาและปัจจัยที่มีผล',1),
('AL65-07.01','AL65-07','AL65','สมดุลเคมีและหลักเลอชาเตอลิเยร์',1),
('AL65-08.01','AL65-08','AL65','กรด-เบสและค่า pH',1),
('AL65-08.02','AL65-08','AL65','บัฟเฟอร์และการไทเทรต',2),
('AL65-09.01','AL65-09','AL65','เซลล์กัลวานิกและอิเล็กโทรลิซิส',1),
('AL65-10.01','AL65-10','AL65','สารประกอบอินทรีย์และหมู่ฟังก์ชัน',1),
('AL65-10.02','AL65-10','AL65','ปฏิกิริยาอินทรีย์',2),
('AL65-11.01','AL65-11','AL65','พอลิเมอร์และวัสดุ',1),

('AL66-01.01','AL66-01','AL66','ความหลากหลายของสิ่งมีชีวิตและอนุกรมวิธาน',1),
('AL66-01.02','AL66-01','AL66','ประชากร ระบบนิเวศ และสิ่งแวดล้อม',2),
('AL66-02.01','AL66-02','AL66','โครงสร้างและหน้าที่ของเซลล์',1),
('AL66-02.02','AL66-02','AL66','ชีวโมเลกุลและเมแทบอลิซึม',2),
('AL66-02.03','AL66-02','AL66','การหายใจระดับเซลล์และการสังเคราะห์ด้วยแสง',3),
('AL66-03.01','AL66-03','AL66','โครงสร้างและการลำเลียงของพืช',1),
('AL66-03.02','AL66-03','AL66','การสืบพันธุ์ การเจริญ และการตอบสนองของพืช',2),
('AL66-04.01','AL66-04','AL66','การถ่ายทอดลักษณะทางพันธุกรรม',1),
('AL66-04.02','AL66-04','AL66','DNA การแสดงออกของยีน และเทคโนโลยีชีวภาพ',2),
('AL66-04.03','AL66-04','AL66','วิวัฒนาการ',3),
('AL66-05.01','AL66-05','AL66','ระบบย่อยอาหารและหายใจ',1),
('AL66-05.02','AL66-05','AL66','ระบบหมุนเวียนเลือด ภูมิคุ้มกัน และขับถ่าย',2),
('AL66-05.03','AL66-05','AL66','ระบบประสาท อวัยวะรับสัมผัส และการเคลื่อนไหว',3),
('AL66-05.04','AL66-05','AL66','ระบบต่อมไร้ท่อและการรักษาดุลยภาพ',4),
('AL66-05.05','AL66-05','AL66','ระบบสืบพันธุ์และการเจริญของสัตว์',5),

('AL82-01.01','AL82-01','AL82','Short Conversations',1),
('AL82-01.02','AL82-01','AL82','Long Conversations',2),
('AL82-02.01','AL82-02','AL82','Reading for Main Ideas and Details',1),
('AL82-02.02','AL82-02','AL82','Inference, Reference and Vocabulary in Context',2),
('AL82-02.03','AL82-02','AL82','Text Organization and Interpretation',3),
('AL82-03.01','AL82-03','AL82','Cloze and Grammar in Context',1),
('AL82-03.02','AL82-03','AL82','Paragraph and Sentence Organization',2),

('AL81-01.01','AL81-01','AL81','การอ่านจับใจความและตีความ',1),
('AL81-01.02','AL81-01','AL81','การวิเคราะห์เจตนาและกลวิธีการใช้ภาษา',2),
('AL81-02.01','AL81-02','AL81','การเรียบเรียงและการเขียนให้เหมาะสม',1),
('AL81-02.02','AL81-02','AL81','การใช้เหตุผลและข้อมูลในการเขียน',2),
('AL81-03.01','AL81-03','AL81','การพูดและการฟังตามสถานการณ์',1),
('AL81-04.01','AL81-04','AL81','คำ การสร้างคำ และความหมาย',1),
('AL81-04.02','AL81-04','AL81','ประโยคและหลักภาษา',2),
('AL81-04.03','AL81-04','AL81','ระดับภาษา สำนวน และการใช้ภาษา',3),

('AL70-01.01','AL70-01','AL70','ศาสนาและหลักธรรม',1),
('AL70-01.02','AL70-01','AL70','ศีลธรรม จริยธรรม และการประยุกต์ใช้',2),
('AL70-02.01','AL70-02','AL70','หน้าที่พลเมืองและกฎหมาย',1),
('AL70-02.02','AL70-02','AL70','การเมือง การปกครอง และสิทธิมนุษยชน',2),
('AL70-02.03','AL70-02','AL70','สังคมและวัฒนธรรม',3),
('AL70-03.01','AL70-03','AL70','เศรษฐศาสตร์จุลภาค',1),
('AL70-03.02','AL70-03','AL70','เศรษฐศาสตร์มหภาคและการเงิน',2),
('AL70-04.01','AL70-04','AL70','ประวัติศาสตร์ไทย',1),
('AL70-04.02','AL70-04','AL70','ประวัติศาสตร์สากล',2),
('AL70-05.01','AL70-05','AL70','ภูมิศาสตร์กายภาพ',1),
('AL70-05.02','AL70-05','AL70','ภูมิศาสตร์มนุษย์และเครื่องมือภูมิศาสตร์',2),
('AL70-05.03','AL70-05','AL70','ทรัพยากร สิ่งแวดล้อม และภัยพิบัติ',3)
ON CONFLICT (topic_id) DO UPDATE SET topic_name_th=EXCLUDED.topic_name_th,sort_order=EXCLUDED.sort_order;


-- A-Level practice bank. It mirrors the จปร. workflow but remains isolated from military-prep data.
CREATE TABLE IF NOT EXISTS public.school_alevel_practice_sets (
  set_no integer PRIMARY KEY CHECK (set_no BETWEEN 1 AND 10),
  label text NOT NULL,
  display_label text,
  source_year integer,
  source_title text,
  source_type text NOT NULL DEFAULT 'generated',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_alevel_practice_questions (
  question_id text PRIMARY KEY,
  set_no integer NOT NULL REFERENCES public.school_alevel_practice_sets(set_no),
  topic_id text NOT NULL REFERENCES public.school_alevel_topics(topic_id),
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  sort_order integer NOT NULL CHECK (sort_order > 0),
  prompt text NOT NULL CHECK (length(prompt) > 0),
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices)='array' AND jsonb_array_length(choices) BETWEEN 2 AND 10),
  question_no integer,
  question_image_url text,
  source_page integer,
  source_year integer,
  source_title text,
  source_type text NOT NULL DEFAULT 'generated',
  answer_key integer NOT NULL CHECK (answer_key BETWEEN 1 AND 10),
  explanation text NOT NULL CHECK (length(explanation) > 0),
  reasoning text NOT NULL CHECK (length(reasoning) > 0),
  source_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id,set_no,subject_id),
  CHECK (left(topic_id,4)=subject_id)
);

CREATE TABLE IF NOT EXISTS public.school_alevel_practice_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL REFERENCES public.school_members(member_id),
  set_no integer NOT NULL REFERENCES public.school_alevel_practice_sets(set_no),
  subject_id text NOT NULL REFERENCES public.school_alevel_subjects(subject_id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','graded')),
  total_count integer NOT NULL CHECK (total_count > 0),
  correct_count integer CHECK (correct_count BETWEEN 0 AND total_count),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by text REFERENCES public.school_members(member_id),
  UNIQUE(member_id,set_no,subject_id),
  UNIQUE(attempt_id,set_no,subject_id),
  CHECK (
    (status='draft' AND submitted_at IS NULL AND graded_at IS NULL AND graded_by IS NULL AND correct_count IS NULL)
    OR (status='submitted' AND submitted_at IS NOT NULL AND graded_at IS NULL AND graded_by IS NULL AND correct_count IS NULL)
    OR (status='graded' AND submitted_at IS NOT NULL AND graded_at IS NOT NULL AND graded_by IS NOT NULL AND correct_count IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.school_alevel_practice_answers (
  attempt_id uuid NOT NULL,
  question_id text NOT NULL,
  set_no integer NOT NULL,
  subject_id text NOT NULL,
  selected_answer integer NOT NULL CHECK (selected_answer BETWEEN 1 AND 10),
  is_correct boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(attempt_id,question_id),
  FOREIGN KEY(attempt_id,set_no,subject_id)
    REFERENCES public.school_alevel_practice_attempts(attempt_id,set_no,subject_id),
  FOREIGN KEY(question_id,set_no,subject_id)
    REFERENCES public.school_alevel_practice_questions(question_id,set_no,subject_id)
);

CREATE INDEX IF NOT EXISTS school_alevel_practice_question_order
  ON public.school_alevel_practice_questions(set_no,subject_id,sort_order,topic_id);
CREATE INDEX IF NOT EXISTS school_alevel_practice_topic_lookup
  ON public.school_alevel_practice_questions(topic_id,set_no,sort_order);
CREATE INDEX IF NOT EXISTS school_alevel_practice_review_queue
  ON public.school_alevel_practice_attempts(submitted_at) WHERE status='submitted';

ALTER TABLE public.school_alevel_practice_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_alevel_practice_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_alevel_practice_sets, public.school_alevel_practice_questions,
  public.school_alevel_practice_attempts, public.school_alevel_practice_answers
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.school_alevel_practice_sets, public.school_alevel_practice_questions,
  public.school_alevel_practice_attempts, public.school_alevel_practice_answers TO service_role;

INSERT INTO public.school_alevel_practice_sets
(set_no,label,display_label,source_year,source_title,source_type,description,is_active) VALUES
(1,'A-Level 2568 · ชุดฝึก 1','ชุด 1',2568,'A-Level 2568','generated',
 'ชุดฝึกตามหัวข้อจากข้อสอบจริง A-Level 2568 สำหรับฝึกซ้ำในรูปแบบเดียวกับระบบ จปร.',true)
ON CONFLICT (set_no) DO UPDATE SET
 label=EXCLUDED.label,display_label=EXCLUDED.display_label,source_year=EXCLUDED.source_year,
 source_title=EXCLUDED.source_title,source_type=EXCLUDED.source_type,
 description=EXCLUDED.description,is_active=EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.school_alevel_practice_start(p_member_id text,p_set_no integer,p_subject_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.school_alevel_practice_attempts%ROWTYPE; n integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id=p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required'; END IF;
  PERFORM 1 FROM public.school_alevel_practice_sets WHERE set_no=p_set_no AND is_active;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='set_not_available'; END IF;
  SELECT count(*) INTO n FROM public.school_alevel_practice_questions WHERE set_no=p_set_no AND subject_id=p_subject_id;
  IF n=0 THEN RAISE SQLSTATE 'PT404' USING MESSAGE='subject_not_available'; END IF;
  INSERT INTO public.school_alevel_practice_attempts(member_id,set_no,subject_id,total_count)
    VALUES(p_member_id,p_set_no,p_subject_id,n)
    ON CONFLICT(member_id,set_no,subject_id) DO NOTHING;
  SELECT * INTO a FROM public.school_alevel_practice_attempts
    WHERE member_id=p_member_id AND set_no=p_set_no AND subject_id=p_subject_id;
  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_alevel_practice_save(p_member_id text,p_attempt_id uuid,p_question_id text,p_selected_answer integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.school_alevel_practice_attempts%ROWTYPE; choice_count integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id=p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required'; END IF;
  SELECT * INTO a FROM public.school_alevel_practice_attempts
    WHERE attempt_id=p_attempt_id AND member_id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found'; END IF;
  IF a.status<>'draft' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='attempt_locked'; END IF;
  SELECT jsonb_array_length(choices) INTO choice_count FROM public.school_alevel_practice_questions
    WHERE question_id=p_question_id AND set_no=a.set_no AND subject_id=a.subject_id;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='question_not_in_attempt'; END IF;
  IF p_selected_answer IS NULL OR p_selected_answer<1 OR p_selected_answer>choice_count THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='invalid_choice';
  END IF;
  INSERT INTO public.school_alevel_practice_answers(attempt_id,question_id,set_no,subject_id,selected_answer)
    VALUES(a.attempt_id,p_question_id,a.set_no,a.subject_id,p_selected_answer)
    ON CONFLICT(attempt_id,question_id) DO UPDATE
      SET selected_answer=EXCLUDED.selected_answer,is_correct=NULL,updated_at=now();
  UPDATE public.school_alevel_practice_attempts SET updated_at=now() WHERE attempt_id=a.attempt_id;
  RETURN jsonb_build_object('attempt_id',a.attempt_id,'question_id',p_question_id,'selected_answer',p_selected_answer);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_alevel_practice_submit(p_member_id text,p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.school_alevel_practice_attempts%ROWTYPE; n integer; answered integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id=p_member_id AND is_active AND can_study FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='study_permission_required'; END IF;
  SELECT * INTO a FROM public.school_alevel_practice_attempts
    WHERE attempt_id=p_attempt_id AND member_id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found'; END IF;
  IF a.status IN ('submitted','graded') THEN RETURN to_jsonb(a); END IF;
  SELECT count(*) INTO n FROM public.school_alevel_practice_questions WHERE set_no=a.set_no AND subject_id=a.subject_id;
  SELECT count(*) INTO answered FROM public.school_alevel_practice_answers WHERE attempt_id=a.attempt_id;
  IF n<>a.total_count THEN RAISE SQLSTATE 'PT409' USING MESSAGE='question_bank_changed'; END IF;
  IF answered<>n THEN RAISE SQLSTATE 'PT422' USING MESSAGE='answer_all_questions'; END IF;
  UPDATE public.school_alevel_practice_attempts SET status='submitted',submitted_at=now(),updated_at=now()
    WHERE attempt_id=a.attempt_id RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.school_alevel_practice_grade(p_grader_id text,p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.school_alevel_practice_attempts%ROWTYPE; n integer; scored integer;
BEGIN
  PERFORM 1 FROM public.school_members WHERE member_id=p_grader_id AND is_active AND can_manage FOR SHARE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE='manage_permission_required'; END IF;
  SELECT * INTO a FROM public.school_alevel_practice_attempts WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='attempt_not_found'; END IF;
  IF a.status='graded' THEN RETURN to_jsonb(a); END IF;
  IF a.status<>'submitted' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='submit_before_grade'; END IF;
  SELECT count(*) INTO n FROM public.school_alevel_practice_answers WHERE attempt_id=a.attempt_id;
  IF n<>a.total_count OR a.total_count<>(SELECT count(*) FROM public.school_alevel_practice_questions
      WHERE set_no=a.set_no AND subject_id=a.subject_id) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='question_bank_changed';
  END IF;
  UPDATE public.school_alevel_practice_answers AS ans SET is_correct=(ans.selected_answer=q.answer_key)
    FROM public.school_alevel_practice_questions AS q
    WHERE ans.attempt_id=a.attempt_id AND ans.question_id=q.question_id;
  SELECT count(*) INTO scored FROM public.school_alevel_practice_answers WHERE attempt_id=a.attempt_id AND is_correct;
  UPDATE public.school_alevel_practice_attempts SET status='graded',correct_count=scored,
    graded_at=now(),graded_by=p_grader_id,updated_at=now()
    WHERE attempt_id=a.attempt_id RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$fn$;

REVOKE ALL ON FUNCTION public.school_alevel_practice_start(text,integer,text),
 public.school_alevel_practice_save(text,uuid,text,integer),
 public.school_alevel_practice_submit(text,uuid),
 public.school_alevel_practice_grade(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_alevel_practice_start(text,integer,text),
 public.school_alevel_practice_save(text,uuid,text,integer),
 public.school_alevel_practice_submit(text,uuid),
 public.school_alevel_practice_grade(text,uuid)
 TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
