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

NOTIFY pgrst, 'reload schema';
COMMIT;
