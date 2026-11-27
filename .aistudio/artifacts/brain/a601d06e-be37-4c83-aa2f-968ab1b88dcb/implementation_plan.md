# Examination Module Overhaul: Examiner Assignments, Controlled Tabulation Pipeline & Official Results Snapshot

Upgrade the institutional examination engine to enforce strict teacher subject access, provide full editing for routines and examiner assignments with dynamic current date defaults, implement an admin-controlled gate to push mark rosters to tabulation, render a detailed multi-head subject-wise Tabulation Register, and persist official saved tabulations from which published results and student marksheets are generated.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed during Phase 1:
>
> - **Confirmed: Tabulation Breakdown Granularity**: The master Tabulation Register will render individual sub-columns for every component head (CQ, MCQ, Practical, CT / custom components), plus the Subject Total and Letter Grade under each subject column header.
> - **Confirmed: Send to Tabulation Pipeline**: Administrators will have individual "Send to Tabulation" actions per subject/section in the Mark Entry Roster, as well as a one-click "Bulk Send All Roster Marks to Tabulation" button.
> - **Confirmed: Teacher Examiner Assignment Scoping**: Administrator examiner assignments can target either specific sections or all sections ("Common") for any class level.
> - **Confirmed: Immutable Saved Tabulation Snapshot**: Tabulation generates as an editable draft. Once saved, it stores an immutable database snapshot in `exam.savedTabulation`. Result publication and student marksheet downloads strictly read from this saved snapshot.

---

### 1. Overview & Core Concept

- **What It Does**: Establishes an end-to-end institutional examination and result lifecycle:
  1. **Strict Examiner Security**: Teachers can only access and enter marks for subjects and sections where an administrator has explicitly assigned them.
  2. **Routine & Examiner Management**: Examination routine schedules and paper inspector assignments are fully editable at any point, with exam date and deadline pickers defaulting to today's active date.
  3. **Admin Review & Tabulation Gate**: Marks submitted by faculty remain in the Mark Entry Roster until an administrator reviews and explicitly dispatches them to the Tabulation Register.
  4. **Multi-Column Subject Tabulation**: A comprehensive Tabulation Register displaying detailed component heads (CQ, MCQ, Practical, CT), totals, grades, overall scores, GPA, 4th subject bonus, and rank.
  5. **Official Saved Tabulation Snapshot**: Guarantees that public search, student portal marksheets, and PDF downloads always draw from the officially saved tabulation record, unaffected by subsequent roster tinkering.
- **Target Audience / Persona**: School and college administrators, exam controllers, class teachers, subject examiners, and students accessing official results.
- **Key Value**: Eliminates unauthorized faculty mark entry, provides full administrative schedule control, prevents unvetted marks from leaking into official transcripts, and ensures bulletproof historical result integrity.

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Examiner Assignment & Routine Scheduling (Admin Flow)**:
   - Admin navigates to **Examinations → 1. Exam Announcements & Routine**.
   - Creating a routine item pre-populates Exam Date and Marks Entry Deadline with today's date (`YYYY-MM-DD`).
   - Every existing routine row features an **Edit** action alongside Delete. Editing opens an inline/modal editor to modify subject, class, group, section (specific or Common), room, inspector teacher, date, time, and deadline. Changes immediately reflect in teacher routines and assignments.
2. **Teacher Restricted Mark Entry (Faculty Flow)**:
   - Teacher signs in at `/teacher/login` and opens `/teacher/dashboard`.
   - The teacher only sees subjects explicitly assigned to them in `exam.examinerAssignments` (or their profile `assignedClasses`). The previous unassigned "All Classes & Subjects" browse mode is removed.
   - If no subjects are assigned for the selected exam, an informative banner notifies the teacher to contact the exam controller.
   - Teachers enter CT, CQ, MCQ, and Practical marks, toggle absent candidates, and lock completed rosters.
3. **Admin Mark Verification & Dispatch to Tabulation (Admin Flow)**:
   - Admin opens **Examinations → 2. Mark Entry & Verification**.
   - Admin filters by class, section, and subject to review entered marks.
   - Each course card and table header displays a **Tabulation Status** indicator: `Not Sent` or `Sent to Tabulation`.
   - Admin clicks **Send [Subject] to Tabulation** or uses **Bulk Send All Roster Marks to Tabulation**.
4. **Draft Tabulation & Official Snapshot Saving (Admin Flow)**:
   - Admin opens **Examinations → 4. Tabulation & Joined Results**.
   - If no marks have been sent to tabulation, an informative state displays: *"No marks sent to tabulation yet. Send marks from the Mark Entry Roster to compile tabulation."*
   - Once marks are sent, a live **Draft / Temporary Tabulation** renders with multi-level headers:
     - Fixed Student Metadata: Roll #, System ID, Student Name, Class & Section, Merit Rank.
     - Grouped Subject Headers: For each subject, sub-columns display CQ, MCQ, Practical, CT (if enabled), Total, and Letter Grade.
     - Overall Summary Columns: Grand Total Marks, Core GPA (without 4th), 4th Subject Bonus, Final GPA, Letter Grade, Status (Passed/Failed), Class & Section Rank.
   - Admin reviews the draft and clicks **Save Tabulation Snapshot**.
   - System commits `exam.savedTabulation` to persistent storage with a timestamp and audit trail.
5. **Result Publication & Marksheet Verification (Public & Student Flow)**:
   - Admin clicks **Publish Exam from Saved Tabulation**.
   - Student Portal (`/student/portal`) and Public Results Lookup (`/api/public/results-lookup`) retrieve transcripts directly from `exam.savedTabulation.records`.
   - Marksheet download, print views, and QR verification authenticate against the saved tabulation snapshot.

#### Visual Identity & Theme

- **Aesthetic Direction**: High-density academic institutional register with clean borders, zero-pill typography, and monospace tabular numerals.
- **Color Palette**:
  - Surface Background: Clean white (`#FFFFFF`) and slate canvas (`#F8FAFC`).
  - Table Borders: Hairline subtle gray (`#E2E8F0`).
  - Status Indicators: Emerald text for Passed/Sent, Amber for Draft/Pending, Crimson for Failed/Absent.
- **Typography & Tabular Discipline**:
  - Display Font: Plus Jakarta Sans / Outfit for institutional headings.
  - Body & Data: System sans with `font-mono tabular-nums` for roll numbers, marks, GPAs, and percentages.
- **Responsive Layout**:
  - Desktop TR View: Full-width horizontal scroll with sticky student identifier column, Legal/A3/A4 print modes, and balanced column widths.
  - Mobile View: Compact summary cards with collapsible subject component trays.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Strict Teacher Subject Visibility vs. Open Browsing
- **Chosen Approach**: Completely remove the "All Classes & Subjects" mode from the Teacher Portal. Teachers can only view, select, and edit marks for subjects assigned to them in `exam.examinerAssignments` or fallback `teacher.assignedClasses`.
- **Why**: Enforces institutional security and accountability. Prevents teachers from accidentally viewing or overwriting peer examiners' papers.
- **Server Enforcement**: The server mutation handler (`/api/erp/mutate` for `saveMarkEntries` and `lockExamRoster`) validates that `session.userId` is assigned to `(subjectId, className, sectionName)`. Unassigned write attempts return `403 Forbidden`.

#### Decision 2: Controlled Tabulation Dispatch Pipeline
- **Chosen Approach**: Mark entries in `markEntries` track an `isSentToTabulation: boolean` flag (or `exam.tabulationSentPapers` list). The Tabulation compilation engine filters only marks that have been explicitly sent by an administrator.
- **Why**: Allows examiners to enter and adjust marks in draft stages without prematurely polluting the official compilation sheet. Gives administrators explicit gatekeeping authority before tabulation generation.
- **Alternative Considered**: Calculating tabulation on all raw mark entries automatically. Passed over because incomplete rosters caused misleading GPAs and ranks.

#### Decision 3: Immutable Saved Tabulation Snapshot for Marksheets
- **Chosen Approach**: Storing an official array `exam.savedTabulation: { savedAt: string, savedBy?: string, records: ExamResultRecord[] }`. Publishing requires saving this snapshot first, and all student marksheets read from this snapshot.
- **Why**: Ensures auditability and consistency. If marks in the entry roster are tweaked after publication (e.g. for re-examination or clerical audits), public transcripts and existing downloaded marksheets remain stable until an administrator explicitly recalculates, re-saves, and re-publishes the tabulation.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXAMINATION WORKFLOW ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────────┘

  [ Admin Console ]                            [ Teacher Portal ]
  • Exam Routine & Examiners                   • Only Assigned Subjects
  • Edit Routine/Examiner Modal                • Input CQ/MCQ/Prac/CT
  • Date defaults to today's date              • Submit & Lock Roster
         │                                              │
         ▼                                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                   Exam.examinerAssignments                  │
  │                   Exam.examRoutine                           │
  │                   MarkEntry[] (Draft / Submitted)            │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                   [ Admin Review & Mark Roster ]
                   • Inspect entered scores
                   • "Send to Tabulation" (Single / Bulk)
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │         MarkEntry.isSentToTabulation = true                  │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                   [ Tabulation Compilation Engine ]
                   • Only includes sent mark entries
                   • Multi-head subject columns: CQ, MCQ, Prac, CT
                   • Grand Total, Core GPA, 4th Bonus, Final GPA
                                 │
                                 ▼
                     Draft Temporary Tabulation
                                 │
                   [ Action: Save Tabulation Snapshot ]
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │       Exam.savedTabulation = { savedAt, records: [...] }     │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                   [ Action: Publish Results ]
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
  [ Student Portal ]                            [ Public Results Lookup ]
  • View Transcript                             • Search by Roll / System ID
  • Download Marksheet (Saved TR)               • QR Code Verification
```

#### Data Model Extensions (`lib/types.ts`)

1. **`ExamRoutineItem` & `ExaminerAssignment`**:
   - `id: string`
   - `className: string`, `group?: AcademicGroup`, `sectionName: string` ('Common' or specific section)
   - `subjectId: string`, `subjectName: string`
   - `date: string` (defaults to today's date `YYYY-MM-DD`)
   - `time: string`, `room?: string`
   - `inspectorTeacherId / teacherId: string`
   - `entryDeadline: string` (defaults to today's date `YYYY-MM-DD`)

2. **`MarkEntry`**:
   - Add `isSentToTabulation?: boolean`
   - Add `sentToTabulationAt?: string`

3. **`SavedTabulation` on `Exam`**:
   ```typescript
   export interface SavedTabulationRecord {
     savedAt: string;
     savedBy?: string;
     records: ExamResultRecord[];
     summary: {
       totalCandidates: number;
       passedCount: number;
       failedCount: number;
       aPlusCount: number;
     };
   }

   // Inside Exam interface:
   savedTabulation?: SavedTabulationRecord;
   ```

#### Component & State Handlers

- **`components/admin/ExaminationsTab.tsx`**:
  - Pre-populate `rDate` and `rDeadline` with `new Date().toISOString().split('T')[0]`.
  - Add `editingRoutineItem` state and modal to edit all fields of any existing routine item and examiner assignment.
  - In Mark Entry Roster: add "Send to Tabulation" per subject/section and "Bulk Send All Roster Marks to Tabulation" invoking `sendMarksToTabulation({ examId, subjectId, className, sectionName })` and `bulkSendMarksToTabulation({ examId })`.
  - In Tabulation View:
    - Display empty state when no marks have been sent to tabulation.
    - Render multi-level table header with grouped subject headers and individual sub-columns (CQ, MCQ, Practical, CT, Total, Grade) alongside final result metrics.
    - Add **Save Tabulation Snapshot** button committing `savedTabulation` to the exam.
    - Gate **Publish Results** to require a saved tabulation snapshot.
- **`app/teacher/dashboard/page.tsx`**:
  - Remove "All Classes & Subjects" tab.
  - Filter `effectiveAssignedClasses` strictly to `currentExam.examinerAssignments` where `teacherId === currentTeacher.id` (with fallback to `currentTeacher.assignedClasses`).
  - Render an empty-assignment notice if no courses are assigned.
- **`app/api/erp/mutate/route.ts`**:
  - Whitelist and handle `sendMarksToTabulation`, `bulkSendMarksToTabulation`, and `saveExamTabulation`.
  - Enforce server-side examiner validation in `saveMarkEntries` to ensure faculty only mutate assigned papers.
- **`app/api/public/results-lookup/route.ts` & `app/student/portal/page.tsx`**:
  - Prioritize `exam.savedTabulation.records` for transcript generation and public lookup.

---

### Verification & Quality Plan

1. **Teacher Access Verification**: Verify that a logged-in teacher can only see assigned subjects, with no option to view or enter unassigned subjects. Verify unassigned mutation attempts return HTTP 403.
2. **Routine & Examiner Editing**: Add a routine item, verify today's date default, edit class/teacher/deadline, and verify changes update immediately in teacher routines and assignments.
3. **Tabulation Gate Verification**: Confirm that Tabulation is empty initially. Submit marks as a teacher, verify they appear in the Admin Mark Entry Roster, click "Send to Tabulation", and verify Tabulation now populates.
4. **Detailed Tabulation Table**: Verify that every subject renders separate columns for CQ, MCQ, Practical, CT (if enabled), Subject Total, and Letter Grade, followed by Grand Total, Core GPA, 4th Bonus, Final GPA, Letter Grade, and Rank.
5. **Saved Tabulation & Marksheet Download**: Save the tabulation snapshot, publish the exam, verify public search and student portal marksheets render from the saved snapshot, and verify PDF/print output matches the TR sheet.
6. **Compile & Lint Verification**: Run `compile_applet` and `lint_applet` together to ensure zero TypeScript errors and clean builds.
