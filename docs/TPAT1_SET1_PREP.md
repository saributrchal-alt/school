# TPAT1 (กสพท.) Set 1 — isolated preparation plan
Status: DRAFT ONLY · NOT DEPLOYED · NOT INSTALLED IN SUPABASE
Prepared: 2026-10-11
Branch: `feature/tpat1-set1-prep`
Base: `8f53416891d9fdbb6bfcf15698a241c6c5279147`

## Hard safety boundary (TPAT3 exam in progress)

- **Do not merge this branch into `main`, deploy, alter production Supabase, or run SQL migrations** during the scheduled TPAT3 sitting.
- Do not touch existing TP30 rows, image URLs, exam sessions, attempts, score release, or existing A-Level/military data.
- No uploads to the live Media server while candidates are sitting exams; store draft assets privately/offline until release.
- TPAT1 answer keys, question text and detailed explanations must remain in a private seed, **not in this public GitHub repository**.
- Do not exceed the repository's 12 JavaScript files. Prefer extending existing modules only after a reviewed change plan.

## Source verification and scope

TPAT1 / กสพท. is organized into **three separate papers/skills**:
1. TPAT11 — เชาวน์ปัญญา / aptitude, quantitative/verbal/logical/spatial reasoning.
2. TPAT12 — จริยธรรมทางการแพทย์ / judgment in healthcare scenarios.
3. TPAT13 — ทักษะการเชื่อมโยง / passage-based relationships and encoded links.

MyTCAS blueprint index TCAS70 does **not** supply an official TPAT1 blueprint page (it lists TPAT2–5). The TPAT1 exam is administered by กสพท. Do not label independently sourced counts, mark allocation or scoring as *official* without checking the current กสพท. notice or specimen first.

Planning references:
- https://mytcas.com/blueprint/ (TCAS70 blueprint index, TPAT1 not listed)
- https://www.mytcas.com/faq/2/ (legacy FAQ: TPAT1 application via กสพท. portal; dates on this FAQ refer to an older year)
- https://nixarmax.com/tpat1 (third-party, 2026, provisional section estimates; **not official**)
- https://www.isranews.org/article/isranews-pr-news/147854-ondemand.html (third-party summary; section estimates differ)

**Provisional only**: many prep descriptions suggest 45 aptitude items, 50–55 ethical scenarios, and a passage/linking paper. The last section must not be forced into five-choice marking. Exact item numbers, encoding rules, times and weights remain **UNCONFIRMED** pending official กสพท. documentation.

## Data isolation design (proposal; no SQL executed)

- Reserve distinct TPAT1 identifiers (proposal: exam group `tpat1`, subject code `TP10`), separate from TPAT3 `TP30` and A-Level `ALxx`.
- Examine existing subject/chapter/topic/question CHECK constraints and REST/API predicates before adding TPAT1; current schema explicitly allows TP30 but not TP10.
- Use a unique namespace in shared `school_alevel_*` bank or separate storage after schema review; ensure set-number collisions are impossible for shared set metadata. Absolutely no bulk UPDATE on existing subjects/questions.
- Preserve current permissions: student cannot see answers/explanations before authorized score/answer release, teacher/admin can review.
- Each paper has independently tracked duration, response model and grading; TPAT13 linking needs a distinct answer representation and validation. Do not reuse TPAT3 five-choice grader unmodified.
- Topic map proposal:
  - `TP10-01`: เชาวน์ปัญญา — อนุกรม, ข้อมูลตาราง/กราฟ, ตรรกะ/วิเคราะห์ข้อความ, มิติสัมพันธ์.
  - `TP10-02`: จริยธรรมทางการแพทย์ — ความลับและความยินยอม, การจัดลำดับประโยชน์และไม่ทำอันตราย, ความเป็นธรรม, การสื่อสาร.
  - `TP10-03`: ความคิดเชื่อมโยง — จับประเด็น, สาเหตุ/ผล, สนับสนุน/ขัดแย้ง, ทำแผนผังความสัมพันธ์.
- Store figures only as WebP on `media.nathoeng.com`, in a TPAT1-specific path under `/uploads/school/`; Supabase keeps URLs only; validate image-question associations. Keep all image keys server-side.

## Content authoring / QC checklist

1. Obtain current กสพท. source/blueprint and establish the exact **per-paper** counts, time limits and marking model.
2. Compose **original** Set 1 questions, explanations and answer keys; no copying publisher mock exams.
3. Create fresh diagrams/graphs where needed, sized below Media's 2 MB/file limit, mapped by stable question IDs. For TPAT13, include reading passage and reference labels.
4. Validate every item's unique question number, topic, five-choice rule only where applicable, answer consistency, and explanation reasoning.
5. Validate navigation, practice mode and timed-exam flow on preview/staging **without pointing at the production Supabase**.
6. Prepare an **idempotent, scoped private seed** plus rollback plan and verification queries; hold execution until the live TPAT3 session ends.
7. After explicit approval, install assets and SQL safely, run isolated tests, merge and production deploy in a controlled window.

## Safe release gate

Before any merge, SQL execution or production deploy:
- Confirm TPAT3 exam has finished and candidate submissions are persisted.
- Verify main and latest production deployment state and backup impacted rows.
- Verify new TPAT1 table/subject constraints, response/grader behavior, role-boundary tests and zero modifications to TP30.
- Do not change or reset TPAT3 sessions, attempts, answer keys, images or release states.

## Current progress

- [x] Created isolated GitHub branch from deployed TPAT3 commit.
- [x] Reviewed TPAT3 implementation and A-Level schema constraints.
- [x] Prepared initial TPAT1 content + architecture plan.
- [ ] Verify current official กสพท. TPAT1 format.
- [ ] Write and validate original question bank and figures privately.
- [ ] Review TPAT13 custom response/grading.
- [ ] Stage and test isolated migrations privately.
- [ ] Import or deploy to production **only when safe and approved**.

## SmartMathPro aptitude review (additional source, 2026-10-11)

Reference: https://www.smartmathpro.com/article/mathtpat1/ — *แจกแนวข้อสอบ TPAT1 เชาวน์ปัญญา และเฉลย พร้อมสอบปี 70*. Article posted 2023, with retrospective descriptions through 2569 and projected 2570 trends; **tutor analysis, not an official กสพท. blueprint**.

The article groups the aptitude paper into four teaching clusters:
1. **Mathematical word problems:** percentages, ratios, work rate, speed, basic statistics and probability, interpretation before computing.
2. **Passages, tables and graphs:** extracting relevant data, comparing, calculating and checking claims.
3. **Logic and statement analysis:** conditional propositions, necessary conclusions and inference from stated definitions.
4. **Thai verbal aptitude:** reading comprehension, author's purpose, analogies and vocabulary.

Year-to-year observations attributed to the article:
- 2566: graph/table/diagram questions frequently grouped around a shared stimulus.
- 2567: more percent/ratio problems; fewer graph questions and no spatial questions reported that year.
- 2568: largely lower-secondary arithmetic, some sets/probability; logic, spatial series and nets reappeared.
- 2569: broadly similar to 2568 but with harder preliminary interpretation, more conditions and distractors; Thai verbal comprehension prominent.
- 2570 predictions are inherently uncertain; article explicitly says no published Thai aptitude blueprint.

**Implications for original authoring:** draft practice questions requiring reading and choosing data before calculation, grouped stimulus items, independently drawn WebP diagrams and charts, and concise step-by-step explanations with alternative shortcuts. Track exact skill and estimated time/item, but do not assert fixed official topic weights. Do not reproduce commercial example questions or their answer keys in the public repository.
