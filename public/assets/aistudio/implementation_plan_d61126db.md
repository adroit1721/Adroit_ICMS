# A4 Print Root-Cause Fix & Upgraded Marksheet Studio

This plan resolves why marksheet printing still overflows or clips across A4 pages and upgrades the Marksheet Studio with Portrait & Smart 2-Column Landscape A4 layouts, independent full-page background and scaled watermark logo layers, a floating per-text-box editor (delete, font size, font family), and expanded institutional typography and border frames.

## User Review & Critical Decisions

> [!IMPORTANT]
> All phase-1 layout and workflow preferences are confirmed below. Please review and approve to begin implementation.

- **Confirmed Decision 1 — Landscape Page Architecture**: **Smart 2-column A4 landscape layout** — full-width institution header across the top, Marks Table & Candidate Bio in the left column (~64%), Board Grading Scale, GPA/Merit KPI summary & Remarks in the right column (~36%), and QR verification + Signatories anchored across the bottom footer.
- **Confirmed Decision 2 — Text Box Editing Controls**: **Floating bar above active text box** — clicking any text box or custom block in Click-to-Edit mode opens a floating micro-toolbar directly above it with **Font Family**, **Font Size**, **Formatting**, and **Delete / Hide Box** controls.
- **Confirmed Decision 3 — Watermark & Full-Page Background**: **Both independent layers** — an edge-to-edge **Full-Page Background** image upload (opacity 5%–100%) paired with a separate centered **Watermark Crest Logo** upload featuring an independent **Percentage Size Scale** (20%–120%) and **Opacity** (4%–35%).

---

## 1. Root Cause Analysis & Print Engine Repair

### Why A4 Marksheet Printing Still Fails to Fit Cleanly
Investigation of the existing print stylesheet, PDF pipeline, and public modal shell uncovered four concrete bugs causing clipped pages, extra website pages, and Page 2 spillover:

1. **Unisolated Public Website Content**: The main content container wrapping the public homepage hero, notices, and gallery renders as a print-visible sibling of the Result Search modal, causing `window.print()` on the public site to output 4–6 pages of website sections before or alongside the marksheet.
2. **Overflow Clipping Without Proportional Fit-to-Page Scaling**: The print stylesheet forces `break-inside: avoid` and `overflow: hidden` without scaling tall content. When a student has 10–14 subjects or paired paper breakdowns, the rendered sheet exceeds `297mm` (`1122px`), either clipping bottom signatory lines or kicking the entire sheet onto a blank Page 2.
3. **Shrunk Narrow Width During PDF Capture**: The off-screen PDF exporter scales tall sheets using `transform: scale(...)` on a fixed `794px` frame, which shrinks horizontal width proportionally and leaves asymmetric blank margins instead of compacting padding/row rhythm to fit edge-to-edge inside the A4 frame.
4. **Hardcoded Portrait Page Geometry**: Both browser `@page` rules and PDF export dimensions are locked to `210mm × 297mm` Portrait, preventing Landscape printing cleanly on single-sheet certificates.

### How We Permanently Fix A4 Single-Page Fitting
- **Strict Top-Level Print Isolation**: When printing any marksheet (from Public Archive Modal, Student Portal, Admin Preview, or Marksheet Studio), all non-marksheet root siblings are collapsed (`display: none`) and ancestor containers are flattened—both via click-triggered print mode and direct `Ctrl+P` / `Cmd+P` detection when a marksheet sheet is mounted.
- **Measured Single-Page Auto-Fit Calibration**: Right before printing or PDF generation, the sheet compares its natural scroll height against the exact target A4 printable box (`210mm × 297mm` Portrait or `297mm × 210mm` Landscape), progressively tightening compact vertical rhythm and applying clean proportional CSS `zoom` (on-screen print) and inverse-compensated full-width stage rendering (PDF capture) so 100% of subjects, remarks, and signatures always fit onto **one crisp edge-to-edge A4 sheet**.
- **True Dual-Orientation `@page` Rules**: Dynamically binds named Portrait (`210mm 297mm`) and Landscape (`297mm 210mm`) `@page` descriptors to match the template's active orientation cleanly across Print and instant 1-click PDF download.

---

## 2. User Experience & Visual Design

### Studio Navigation & Live Canvas Workflow
- **Instant Orientation Switcher (`Portrait A4` | `Landscape A4`)**: Positioned right inside the top Studio bar and Design panel. Switching toggles the A4 canvas preview smoothly between `210×297mm` vertical and `297×210mm` widescreen 2-column certificate geometry, automatically re-calibrating spacing presets.
- **Smart 2-Column A4 Landscape Composition**:
  - **Top Full-Span Zone**: Crest + Institution Title, Address/EIIN/Board metadata, and Examination Title pill/divider tailored to match Museum & Editorial institutional elegance.
  - **Main Split Grid (`grid-cols-12`, 8:4 split)**:
    - *Left Column (`col-span-8`)*: Compact horizontal Candidate Bio card (with optional portrait photo) stacked directly above the Subject Marks table with tabular figures (`tabular-nums`).
    - *Right Column (`col-span-4`)*: Vertical Board Grading Scale reference table, 3 stacked Aggregate / GPA / Merit Standing summary blocks, and Attendance / Conduct / Teacher's Remark panel.
  - **Bottom Full-Span Footer Zone**: Custom notice/token blocks, Digital Verification QR stamp, Custom footer disclaimer, and multi-signatory signature rail.
- **Dual Image Layers (Page Background + Scaled Watermark Logo)**:
  - **Full-Page Sheet Background**: Dedicated upload control (`Upload Background`), clear button, and **Background Opacity (`5%–100%`)** slider covering the entire A4 canvas edge-to-edge (supporting pre-designed bordered certificates, parchment textures, or guilloché stationery).
  - **Centered Watermark Crest Logo**: Dedicated upload control (`Upload Watermark Logo`, optional quick button to copy School Crest), **Watermark Size Scale (`20%–120%`)** percentage slider, and **Watermark Opacity (`4%–35%`)** slider centered symmetrically inside the sheet frame.
- **Floating Inline Text Box Toolbar (Click-to-Edit Mode)**:
  - Hovering or clicking any built-in label box or custom text block reveals a dashed amber selection outline and anchors a floating white editorial bar immediately above the element with:
    1. **Text Box Font Selector** (overrides typography per element or inherits sheet font)
    2. **Text Box Font Size (`9px–24px`)** numeric stepper/dropdown
    3. **Alignment & Emphasis** (Bold / Italic / Left-Center-Right for custom blocks)
    4. **Delete / Hide Button**: Removes custom text blocks completely or hides/clears optional built-in boxes (with a compact *"Hidden Elements"* restore strip in the Studio inspector).
- **Institutional Typography & Decorative Border Frames**:
  - **Typography Pairing**: Independent **Heading / Display Font** and **Body / Table Font** selectors (plus tabular monospace figures locked across grades, marks, GPA, codes, and roll numbers):
    - *Serifs & Institutional*: `Playfair Display`, `Cormorant Garamond`, `Lora`, `Crimson Pro`, `Cinzel`
    - *Crisp Modern Editorial Sans*: `Plus Jakarta Sans`, `Manrope`, `DM Sans`, `Outfit`
  - **Border Frame Styles**:
    - `Classic Double Border` (formal double-ruled institutional line)
    - `Modern Clean Rounded` (hairline architectural frame)
    - `Official Certificate Box` (thick outer frame + inset fine seal border + corner accents)
    - `Ornate Guilloché Crest Frame` (ceremonial double border with geometric SVG corner flourishes in accent color)
    - `Royal Diploma Pinstripe` (multi-ring outer/inner border with corner medallions)
    - `Architectural Corner Brackets` (clean open frame anchored by crisp L-brackets at all four corners)
    - `Borderless / Minimal` (for pre-printed stationery)

---

## 3. Key Product Decisions & Trade-Offs

- **Print Calibration via Measured CSS `zoom` + Inverse-Width PDF Stage**
  - *Chosen Approach*: Measure natural layout height relative to target A4 height right before printing/PDF capture and apply calibrated edge-to-edge scaling without narrowing horizontal gutters.
  - *Why*: Eliminates both clipping/Page-2 overflow on 13+ subject sheets and left/right margin shrinkage common with naive CSS `transform: scale`.
  - *Alternatives Considered*: Fixed single tiny font size (makes 6–8 subject transcripts look sparse and cramped on A4).

- **Dual Separate Media Fields with Clean Legacy Fallback**
  - *Chosen Approach*: Keep `marksheetBgUrl` / `pageBackgroundUrl` cleanly distinguished from `watermarkLogoUrl` and `watermarkScalePercent` inside the exam template configuration, gracefully inheriting existing watermarks without breaking saved exams.
  - *Why*: Existing published exams retain their configured crest watermark while allowing new templates to combine rich stationery backgrounds + scaled transparent crests simultaneously.

- **Per-Element Text Style Map + Floating Edit Bar**
  - *Chosen Approach*: Store per-box `fontFamily`, `fontSizePx`, and hidden-key toggles inside template label styles alongside existing custom block styles, surfaced through a single shared floating toolbar overlay.
  - *Why*: Gives admins effortless canvas-first editing across every label and custom text box without bloating the side inspector.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Persisted Exam Template State                      │
│  orientation ('portrait' | 'landscape') · layout · borderFrameStyle    │
│  headingFont · bodyFont · pageBackgroundUrl/Opacity                    │
│  watermarkLogoUrl / watermarkScalePercent / watermarkOpacity           │
│  labels + perLabelStyle { fontSizePx, fontFamily, hidden }             │
│  customTextBlocks[] { fontSizePx, fontFamily, align, bold, bordered }  │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │                                        │
                ▼                                        ▼
┌────────────────────────────────┐     ┌─────────────────────────────────┐
│    Click-to-Edit Studio UI     │     │    Print & A4 PDF Consumers     │
│  - Orientation & Typography    │     │  - Public Result Archive Modal  │
│  - Split Bg & Watermark Logo   │     │  - Student Portal Transcript    │
│  - Frame Gallery & Margin/Font │     │  - Admin Live Marksheet Preview │
│  - Floating Box Editor Toolbar │     └────────────────┬────────────────┘
│    (Delete · Size · Font)      │                      │
└───────────────┬────────────────┘                      │
                │                                       │
                ▼                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                Shared Marksheet Sheet & A4 Fit Engine                  │
│  1. Renders Portrait (210×297mm) OR Smart 2-Column Landscape (297×210) │
│  2. Layers: Full-Page Bg -> Scaled Centered Watermark -> Ornamental SVG│
│  3. Loads Google Fonts for Heading, Body & Tabular Numeral faces       │
│  4. Measures content height -> auto-fits edge-to-edge onto 1 A4 page  │
│  5. Isolated Print Root (`window.print()`) + 2.5x Retina PDF Export    │
└────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- **Template Data Model**: Extends exam marksheet configuration cleanly with orientation (`portrait` | `landscape`), dual font selectors (`headingFont`, `bodyFont`), split media fields (`pageBackgroundUrl`, `pageBackgroundPublicId`, `pageBackgroundOpacity`, `watermarkLogoUrl`, `watermarkLogoPublicId`, `watermarkScalePercent`, `watermarkOpacity`), expanded `borderStyle` union (`ornate-guilloche`, `diploma-crest`, `corner-brackets`), and per-box `labelStyles` (`fontSizePx`, `fontFamily`, `hidden`) + `customTextBlocks` font/size/delete support.
- **Floating Contextual Box Editor**: Tracks currently focused inline box key (`label:<key>` or `block:<id>`), renders a high-contrast `no-print` floating bar directly above the selected box with live Font Family `<select>`, Font Size `- / +` & selector, formatting toggles, and Delete/Hide action, committing cleanly on change without closing active typing prematurely.
- **Print & PDF Calibration Pipeline**: Wraps marksheet document output with print-safe orientation classes (`a4-portrait` / `a4-landscape`), dynamically updates CSS `@page` sizing and computes exact fit-to-page zoom when overflowing before opening system Print Dialog or generating matching Portrait/Landscape `jsPDF` A4 files.
