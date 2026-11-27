# Public Result Search, A4 Marksheet PDF Engine & Full-Editable Marksheet Studio

Fix the public Result Search modal layout and lookup bugs, deliver an instant single-page A4-fitted PDF download and vector print experience, and upgrade the Marksheet Studio into a comprehensive click-to-edit visual layout and text designer across Public, Student, and Admin portals.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices were confirmed during Phase 1:
>
> - **Confirmed: Built-In Click-to-Edit A4 Studio**: Rather than external Google Docs OAuth templates (which require per-user Google sign-in, cannot dynamically expand variable subject/component rows or 4th-subject rules, and add multi-second export latency), the built-in Marksheet Studio will become a complete live click-to-edit A4 visual and copy editor persisted directly in the school database.
> - **Confirmed: Two-Tab Public Result Search with Security Captcha**: The public Result Lookup modal will offer two focused tabs — **Search by Student ID** and **Search by Class & Roll** — with the security captcha intact, **Group** removed, and **Section** displayed dynamically only when the selected class defines multiple sections.
> - **Confirmed: Instant 1-Click A4 PDF Download + Print Button**: Students and admins will get both a direct 1-click A4 PDF download button and an isolated single-page vector Print-to-PDF button, guaranteeing zero page-2 spills or modal border clipping.

---

### 1. Overview & Core Concept

- **What It Does**: Overhauls the public result verification and official transcript pipeline end-to-end:
  1. **Reliable Public Result Lookup**: Synchronizes class, year, and conditional section state with live database classes, supports searching by unique Student ID / Registration Number or by Class + Roll (+ conditional Section), prioritizes saved official tabulation snapshots, and hydrates student display photo/Bangla name safely for public transcripts.
  2. **Viewport-Fitted Result Modal**: Replaces the overflowing centered modal with a sticky-header, bounded-height dialog that fits cleanly on mobile, laptop, and desktop viewports without top/bottom cutoff.
  3. **Exact Single-Page A4 PDF & Print Engine**: Produces crisp `210mm × 297mm` single-page A4 marksheets via both direct 1-click PDF file export (with automatic multi-subject density fit) and isolated vector print styling.
  4. **Click-to-Edit Marksheet Studio**: Allows administrators to click directly on virtually any label, title, column header, summary phrase, remark, or custom text block on the live A4 preview to rewrite wording, reorder sections, adjust millimeter margins, typography scale, border styles, header alignments, and rich token blocks.
- **Target Audience / Persona**: Students and guardians checking public examination results, school/college administrators customizing institutional transcript branding, and exam controllers printing official A4 marksheets.
- **Key Value**: Eliminates false `"No matching examinee found"` errors from the homepage header result trigger, delivers publication-ready A4 PDFs every time, and gives total editorial control over marksheet wording and layout inside the ERP without third-party authentication friction.

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Public Result Search Flow (Homepage Header & Academics Portal)**:
   - Clicking **Result Published** in the top bar or **Result & Marksheet** opens the **Official Student Result & Marksheet Archive** modal, immediately synced to the first available published exam and active class list.
   - Users switch between two clean segmented tabs:
     - **Tab 1 — Search by Student ID**: Select Examination + Academic Year, enter **Student ID** (or Registration No.), solve the math security captcha, and click **Show Result**.
     - **Tab 2 — Search by Class & Roll**: Select Examination + Academic Year + Class. If that class has multiple sections configured, a **Section** dropdown appears automatically; if the class is a single cohort without sections, the Section field stays hidden. **Group** is omitted completely. Enter **Roll Number**, solve the captcha, and click **Show Result**.
   - On match, the modal smoothly transitions into a responsive A4 transcript preview with a compact action toolbar (`Search Another Result`, `Download A4 PDF`, `Print A4 Marksheet`).

2. **Instant A4 PDF Download & Print Flow (Public, Student & Admin)**:
   - Clicking **Download A4 PDF** generates an exact `210mm × 297mm` portrait PDF file (`Marksheet-[Name]-Roll-[Roll].pdf`) using a clean off-screen unclipped A4 frame with automatic fit-to-one-page scaling when a student takes 12+ subjects.
   - Clicking **Print A4 Marksheet** activates an isolated print mode that hides modal chrome, resets page margins cleanly, and outputs a crisp vector page without trailing blank pages.

3. **Full Click-to-Edit Marksheet Studio Flow (Admin Console)**:
   - Inside **Examinations → Marksheet Studio**, an **Inline Edit Mode** toggle activates subtle interactive edit outlines directly on the live A4 canvas.
   - Clicking any header line, bio label, table column title, summary heading, status label, QR caption, or footer remark opens an inline editor or focuses the matching control in the left Inspector Drawer.
   - Admins can switch Inspector tabs across **Copy & Labels** (every text string + dynamic token blocks), **Layout & Spacing** (section order Up/Down, header style, compact/balanced/spacious density, font family & size slider, millimeter margins, border thickness & radius), **Visibility & Columns** (profile/table toggles), and **Signatories & Watermark**, plus apply 1-click institutional presets or save across all exams.

#### Visual Identity & Theme

- **Aesthetic Direction**: Institutional archival clarity paired with a clean studio workbench. Public search keeps warm alabaster surfaces (`--background`, `--surface-container-lowest`), crisp hairline dividers (`--outline-variant`), and restrained terracotta primary actions (`--primary-container`); the A4 transcript renders on stark pure white (`#FFFFFF`) with sharp `tabular-nums` alignment and classic institutional framing.
- **Typography & Hierarchy**: Display headings in `Plus Jakarta Sans` (`text-wrap: balance`), body and form controls in `Plus Jakarta Sans` / `DM Sans` with `16px+` outer modal padding and `2:1` horizontal-to-vertical button proportions, and all roll numbers, marks, GPAs, and IDs strictly in monospace `tabular-nums`. Marksheet preview supports switching between clean institutional sans and formal editorial serif (`Source Serif 4` / `Georgia` serif).
- **Zero-Pill & Anti-Slop Discipline**: Segmented search tabs use clean stateful tab buttons rather than decorative capsules; static exam/student metadata uses crisp unboxed typographic separators (`·`); status feedback (loading spinner, inline lookup error banner, PDF export confirmation) always pairs icon + clear prose.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Built-In Click-to-Edit A4 Studio vs. Google Docs API Integration
- **Chosen Approach**: Upgrade the native `MarksheetTemplate` schema and Marksheet Studio into a full click-to-edit copy, token-block, geometry, and section-order editor rendered directly in the A4 component.
- **Why**:
  - Zero OAuth popups or token expiry for admins; public visitors and students can immediately download customized transcripts without Google Drive permissions.
  - Supports dynamic NCTB logic cleanly (auto-expanding 6 to 14 subjects, conditional CT/CQ/MCQ/Practical/Custom component columns, paired 1st/2nd paper sub-lines, 4th-subject badges, live SVG QR codes, and Bangla Unicode text).
  - Instant feedback: every label, margin, and section-order edit previews in real time and applies across Admin, Student, and Public views on save.
- **Alternatives Considered**: Live Google Docs template syncing via Workspace OAuth (`documents.batchUpdate` + Drive PDF export). Passed over because per-student Doc cloning takes 2–5 seconds per transcript, breaks dynamic table column toggling, and blocks unauthenticated public student PDF downloads.

#### Decision 2: Root-Cause Fix for Homepage Header "Student Not Found" & Dynamic Section Logic
- **Chosen Approach**:
  - Replace frozen initial `useState` class/year defaults with derived state synchronized to hydrated database records so the visible `<select>` option always matches the submitted filter payload.
  - Dynamically inspect the selected class's section configuration (`hasSections` and non-`Common` section list) to show or hide the Section picker and omit Section filtering when a class has no sections.
  - Enhance the public lookup API to accept either `studentIdQuery` (`systemId` or `registrationNumber`) or `className + rollNumber (+ optional sectionName)`, querying the exam's saved official tabulation snapshot first before falling back to live published student records, and returning non-sensitive transcript profile fields (`avatarUrl`, `banglaName`, `dateOfBirth`).
- **Why**: Fixes the silent React state mismatch (`'Grade 10'` sent even when the dropdown displayed another class), removes unnecessary Group/Section friction, and ensures lookup works even for archived/promoted batches stored in saved tabulations.

#### Decision 3: Off-Screen Scaled A4 Capture + Isolated Print Root for Single-Page PDF
- **Chosen Approach**: Combine a dedicated high-DPI client PDF generator (rendering an unclipped `210mm × 297mm` DOM clone at 3× scale into a single `A4 portrait` PDF page with auto vertical fit when tall subject tables exceed 297mm) alongside a fixed print stylesheet (`@page { size: A4 portrait; margin: 0mm; }` with `.no-print` modal shell bypass).
- **Why**: Ensures 1-click PDF downloads look identical across Chrome, Safari, Edge, and mobile browsers without browser-injected header/footer URLs or blank second pages, while keeping native vector printing one click away.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│               PUBLIC RESULT SEARCH, STUDIO & A4 PDF PIPELINE                 │
└──────────────────────────────────────────────────────────────────────────────┘

  [ Public Header / Homepage / Academics ]
          │  (Opens bounded Result Modal; syncs class & exam state)
          ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Official Result Archive Modal (Two Tabs + Math Captcha)                  │
  │  • Tab A: Student ID / Reg No. + Exam + Year                             │
  │  • Tab B: Class + Dynamic Section (only if class has sections) + Roll    │
  └───────────────────────────────────────┬──────────────────────────────────┘
                                          │ POST /api/public/results-lookup
                                          ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Public Results Lookup Service                                            │
  │  1. Match Published Exam                                                 │
  │  2. Resolve by systemId/regNo OR (className + rollNumber + sectionName)  │
  │  3. Read immutable Exam.savedTabulation -> Published Results -> Compute  │
  │  4. Return { exam, result, studentMeta (photo, banglaName, DOB) }        │
  └───────────────────────────────────────┬──────────────────────────────────┘
                                          │
          ┌───────────────────────────────┴───────────────────────────────┐
          ▼                                                               ▼
  [ Shared A4 Marksheet Renderer ]                        [ Admin Marksheet Studio ]
  • Applies full MarksheetTemplate config                 • Click-to-Edit inline text
  • Dynamic section order & column headers                • Layout, spacing & mm margins
  • Custom rich token blocks ({{gpa}}, etc.)              • Reorder sections & presets
          │                                                               │
          ├───────────────────────────┬───────────────────────────────────┘
          ▼                           ▼
  [ 1-Click A4 PDF Export ]   [ Isolated Vector Print ]
  • Unclipped 210×297mm clone • @page A4 portrait (0mm)
  • Auto-fit scale if >297mm  • Collapses modal padding/shadows
  • Saves .pdf file directly  • Sets clean document print title
```

#### Data Model & State Extensions

1. **Extended `MarksheetTemplate` Configuration**:
   - **Editable Text & Copy Dictionary (`labels`)**: Overrides for header school name/address line, exam subtitle, all candidate bio field labels (`candidateName`, `classRoll`, `regNo`, `fatherName`, `motherName`, `classSection`, `groupShift`, `studentId`, `dateOfBirth`), marks table headers (`code`, `subjectName`, `fullMarks`, `passMarks`, `ct`, `cq`, `mcq`, `practical`, `total`, `gp`, `grade`, `fourthBadge`), summary titles (`aggregateTitle`, `gpaTitle`, `coreGpaLabel`, `fourthBonusLabel`, `meritTitle`, `classRankLabel`, `sectionRankLabel`, `passedText`, `failedText`), attendance/remarks labels (`workingDaysLabel`, `daysPresentLabel`, `conductLabel`, `remarkLabel`, `defaultPassRemark`, `defaultFailRemark`), and verification caption (`qrTitle`, `qrSubtitle`, `gradingScaleTitle`).
   - **Layout & Geometry Controls**: `layoutPreset`, `headerLayout` (`centered` | `left-crest` | `split-banner`), `density` (`compact` | `balanced` | `spacious`), `pageMarginMm`, `fontScale` (e.g. `0.85`–`1.15`), `borderWidthPx`, `borderRadiusPx`, `sideBySideBioAndScale` toggle, `sectionOrder` array (`['header', 'bio', 'table', 'summary', 'attendance', 'custom-blocks', 'signatures']`), and `autoFitSinglePage` flag.
   - **Rich Custom Text Blocks (`customTextBlocks`)**: Ordered list of editable prose/disclaimer/header-banner items with `placement` (`below-header` | `above-table` | `below-summary` | `above-signatures`), `align` (`left` | `center` | `right`), `fontSize`, and dynamic placeholder substitution (`{{studentName}}`, `{{rollNumber}}`, `{{gpa}}`, `{{grade}}`, `{{examTitle}}`).
   - **Custom Marks Columns & Fields Preservation**: All existing `customFields`, `signatories`, `stationeryMode`, `marksheetBgUrl`, and per-student overrides remain backward-compatible with safe defaults.

#### Interactive Component & State Mapping

- **Public Result Modal**:
  - `searchMode`: `'id' | 'class-roll'` controlling the two-tab UI and conditional validation.
  - Derived `effectiveExamId`, `effectiveYear`, `effectiveClass`, and `activeClassSections` ensure zero stale defaults after async bootstrap hydration.
  - Conditional Section selector renders only when `activeClassObj?.hasSections !== false && activeClassSections.some(s => s !== 'Common')`; resets automatically when `selectedClass` changes.
  - Scrollable flex-column dialog (`max-h-[92vh]`) prevents viewport clipping on form and A4 views.
- **Results Lookup Endpoint**:
  - Validates captcha-submitted payload for either `searchMode === 'id'` (`studentIdQuery`) or `searchMode === 'class-roll'` (`className`, `rollNumber`, optional `sectionName`).
  - Searches `examDoc.savedTabulation.records` directly by `systemId` / `registrationNumber` or `className` + `rollNumber` (+ `sectionName` if provided) before falling back to student registry lookup, guaranteeing consistent results even when student records change later.
- **A4 PDF & Print Utility**:
  - Dedicated client helper mounts/clones the rendered marksheet node into a fixed-width `794px` (`210mm`) off-screen container, measures total height against `1123px` (`297mm`), applies subtle vertical auto-fit compression if needed, captures crisp high-DPI canvas output, and writes an A4 portrait PDF via `jsPDF` (`210mm × 297mm`).
  - Print action toggles `.printing-marksheet` on document root during `window.print()`, suppressing modal padding/scroll containers and `@page` margin collisions so vector printing stays strictly 1 A4 page.
- **Marksheet Studio & Document Renderer**:
  - `MarksheetDocument` accepts optional `isInlineEditMode` and `onInlineEditLabel(key, value)` props; when active in the Admin Studio, clicking any label renders a clean inline text input with instant save/Enter commit.
  - Studio drawer organizes controls cleanly into **Design & Layout**, **Text & Labels**, **Sections & Order**, **Custom Blocks & Data**, and **Signatories**, with 1-click preset loading and exam/global persistence.
