# Engineering EdTech Platform — Advanced Quiz Builder Architecture

Single-domain RBAC app (Admin / Instructor / Student). Extends the existing Users/Courses/Enrollments schema.

## 1. Database Schema (Relational)

```sql
-- existing: users(id, email, password_hash, full_name, role, student_id, created_by, is_active, created_at)
-- existing: courses(id, slug, title, description, course_url, instructor_id, created_at)
-- existing: enrollments(id, user_id, course_id, granted_by, created_at)

-- NEW: a course is broken into an arbitrary number of chapters (บท),
-- defined and ordered freely by the instructor — no fixed count.
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,          -- e.g. "บทที่ 1: พื้นฐาน K-Factor"
  sort_order INTEGER DEFAULT 0, -- instructor drag-reorders chapters
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE materials (
  id INTEGER PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id),   -- was course_id — now nested under a chapter
  type TEXT CHECK(type IN ('text','image','audio')) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,              -- text content or caption
  file_url TEXT,           -- image/audio storage path (native upload, no AI)
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE quizzes (
  id INTEGER PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id),   -- was course_id — one quiz belongs to one chapter
  title TEXT NOT NULL,
  instructions TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- เช็คสำคัญ: quiz_type คือ "ประเภทคำถาม" — มี 6 ประเภทให้ครูเลือกจาก dropdown
-- ต่อ 1 คำถาม (ไม่ใช่ "ควิซต้องมี 6 ข้อ") ครูสร้างคำถามกี่ข้อก็ได้ในหนึ่งควิซ
-- โดยแต่ละข้อเลือกประเภทไหนก็ได้อิสระ ซ้ำกันได้ (เช่น quiz มี 10 ข้อ เป็น numeric ทั้งหมดก็ได้)
CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  quiz_type TEXT CHECK(quiz_type IN
    ('multiple_choice','short_answer','file_upload','numeric','sequencing','hotspot')) NOT NULL,
  prompt TEXT NOT NULL,
  points REAL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  params_json TEXT NOT NULL   -- type-specific config, see below
);

-- params_json payload shape per quiz_type (validated at API layer, not separate tables —
-- keeps schema flexible for future quiz types without migrations):
--
-- multiple_choice: {"options":["A","B","C"], "correct_index":1}
-- short_answer:    {"keywords":["torque","นิวตันเมตร"], "case_sensitive":false}
-- file_upload:      {"accept":"application/pdf", "max_mb":10}   -- grading state lives in submissions
-- numeric:          {"target":9.81, "tolerance":0.05}            -- |answer-target| <= tolerance
-- sequencing:       {"items":["Step A","Step B","Step C"], "correct_order":[2,0,1]}
-- hotspot:          {"image_url":"...", "zones":[{"x":10,"y":20,"w":50,"h":50}]}

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  answer_json TEXT NOT NULL,     -- student's raw answer, shape mirrors params_json
  is_correct INTEGER,            -- NULL until graded (auto or manual)
  score REAL,
  grading_state TEXT CHECK(grading_state IN ('auto','pending','graded')) DEFAULT 'auto',
  feedback TEXT,                 -- instructor feedback (manual grading, e.g. file_upload)
  graded_by INTEGER REFERENCES users(id),
  submitted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(question_id, student_id)
);

CREATE TABLE scores (   -- aggregated per quiz attempt, for fast dashboard/export
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  total_score REAL,
  max_score REAL,
  completed_at TEXT,
  UNIQUE(quiz_id, student_id)
);
```

**Grading logic by type:** multiple_choice/numeric/sequencing/hotspot auto-grade on submit (compare `answer_json` to `params_json` rule); short_answer auto-grades via keyword match (case toggle); file_upload always starts `pending`, instructor sets `graded` + `feedback` + `score` manually.

---

## 2. API Routes

```
Auth
  POST   /api/auth/login
  GET    /api/auth/me

Admin (existing, unchanged)
  GET/POST   /api/admin/users
  PATCH/DEL  /api/admin/users/{id}

Instructor — Courses (existing)
  GET/POST  /api/instructor/courses
  POST      /api/instructor/students
  GET       /api/instructor/courses/{id}/students
  POST/DEL  /api/instructor/courses/{id}/enrollments[/{uid}]

Instructor — Chapters (NEW: unlimited, instructor orders/renames freely)
  GET/POST/PATCH/DELETE  /api/instructor/courses/{id}/chapters[/{cid}]
  PATCH                   /api/instructor/courses/{id}/chapters/reorder       (bulk sort_order update)

Instructor — Content (now nested under a chapter, not the whole course)
  GET/POST/PATCH/DELETE  /api/instructor/chapters/{cid}/materials[/{mid}]
  POST                    /api/instructor/chapters/{cid}/materials/{mid}/audio   (multipart upload)

Instructor — Quiz Builder (now nested under a chapter)
  GET/POST/PATCH/DELETE  /api/instructor/chapters/{cid}/quizzes[/{qid}]
  GET/POST/PATCH/DELETE  /api/instructor/quizzes/{qid}/questions[/{qid2}]     (quiz_type chosen per question, dropdown of the 6 types)
  GET                     /api/instructor/quizzes/{qid}/submissions          (all students, grading queue)
  PATCH                   /api/instructor/submissions/{sid}                  (manual grade: score/feedback/state)
  GET                     /api/instructor/quizzes/{qid}/export.xlsx          (Excel/CSV export)

Student (read + submit only)
  GET   /api/student/courses[/{id}]
  GET   /api/student/courses/{id}/chapters                     (chapter list, sequential)
  GET   /api/student/chapters/{cid}/materials
  GET   /api/student/chapters/{cid}/quizzes
  GET   /api/student/quizzes/{qid}/questions        (params_json stripped of correct-answer fields)
  POST  /api/student/questions/{qid}/submit         (auto-grades inline where applicable)
  GET   /api/student/quizzes/{qid}/result
```

All instructor routes re-check `course.instructor_id == current_user.id` (existing `_owned_course` pattern), resolved by joining `chapter → course`, before any read/write — prevents cross-instructor access to chapters/materials/quizzes/submissions, same as the current enrollment whitelist guard.

---

## 3. UI Component Tree

```
App
├─ LoginView
└─ AppShell (role badge + logout)
   ├─ AdminPanel                         [existing]
   │
   ├─ InstructorPanel
   │  ├─ CreateStudentForm               [existing]
   │  ├─ CreateCourseForm                [existing]
   │  └─ CourseCard (per course)
   │     ├─ RosterTable + WhitelistForm  [existing]
   │     └─ ChapterList (instructor adds/renames/reorders — unlimited บท, no fixed count)
   │        └─ ChapterCard (per บท, e.g. "บทที่ 1", "บทที่ 2", ...)
   │           ├─ MaterialsTab
   │           │  ├─ MaterialList (text/image/audio, drag-reorder within this chapter)
   │           │  └─ MaterialEditor (type picker → conditional fields; audio = native file input)
   │           └─ QuizzesTab (1+ quizzes per chapter)
   │              └─ QuizBuilder (per quiz)
   │                 ├─ QuestionList (sortable; instructor adds as many questions as needed)
   │                 └─ QuestionEditor (per question)
   │                    └─ QuizTypeDropdown  ← ครูเลือก 1 ใน 6 ประเภทนี้สำหรับแต่ละข้อ (ซ้ำกันได้):
   │                       ├─ MultipleChoiceParams (options[] + radio correct)
   │                       ├─ ShortAnswerParams (keyword tags + case toggle)
   │                       ├─ FileUploadParams (accept type + max size)
   │                       ├─ NumericParams (target + ± tolerance)
   │                       ├─ SequencingParams (draggable item list)
   │                       └─ HotspotParams (image upload + draw rectangle zones)
   │              └─ GradingQueue (file_upload submissions: view PDF, score, feedback)
   │              └─ ExportButton (→ Excel/CSV)
   │
   └─ StudentPanel                       [existing, read-only]
      ├─ CourseTile → CourseDetail
      │  └─ ChapterList (sequential บทที่ 1, 2, 3, ...)
      │     └─ ChapterDetail (per บท)
      │        ├─ MaterialViewer (text/image/audio player, this chapter's content)
      │        └─ QuizList → QuizRunner
      │           └─ QuestionRenderer ← switches on this question's chosen quiz_type:
      │              ├─ MultipleChoiceQ / ShortAnswerQ / NumericQ (inline auto-feedback)
      │              ├─ FileUploadQ (upload widget, shows pending/graded + feedback)
      │              ├─ SequencingQ (drag-to-order list)
      │              └─ HotspotQ (click-on-image, shows correct zone on submit)
      └─ ResultView (score breakdown per quiz)
```

**สิ่งที่เปลี่ยนจากเสนอเดิม:**
1. เพิ่มชั้น `chapters` (บท) — 1 course แบ่งออกเป็นกี่บทก็ได้ ครูกำหนดเอง ไม่จำกัดจำนวน
2. `materials` และ `quizzes` ตอนนี้ผูกกับ `chapter_id` แทน `course_id` เดี่ยว (เนื้อหาและควิซอยู่ในแต่ละบท)
3. `quiz_type` ในตาราง `questions` คือ **ประเภทของคำถามแต่ละข้อ** (เลือกได้ 1 ใน 6 แบบ) — ไม่เกี่ยวกับจำนวนข้อในควิซ ครูสร้างกี่ข้อก็ได้ในหนึ่งควิซ โดยแต่ละข้อเลือกประเภทอะไรก็ได้อิสระ ซ้ำกันได้
4. การเพิ่มประเภทคำถามข้อที่ 7 ในอนาคต์ ต้องการเพียงเพิ่ม case ใหม่ใน `TypeParamsForm`/`QuestionRenderer` เท่านั้น โดยไม่ต้อง migrate schema
