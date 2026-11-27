export type ReligionGroup = 'Islam' | 'Hinduism' | 'Buddhism' | 'Christianity' | 'Other';
export type AcademicGroup = 'Science' | 'Humanities' | 'Business Studies' | 'General';
export type ShiftType = 'Morning' | 'Day';
export type GenderType = 'Male' | 'Female' | 'Other';
export type SubjectGenderRestriction = 'All' | 'Female';

export type HeaderLayoutStyle = 'classic-centered' | 'compact-split' | 'minimal-bar';

export interface NavbarSubMenuItem {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: string;
}

export interface NavbarMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  visible: boolean;
  children?: NavbarSubMenuItem[];
}

export interface LeadershipCard {
  id: string;
  sectionTitle: string;
  name: string;
  designation: string;
  subDesignation: string;
  honoraryBadge: string;
  photoUrl: string;
  photoPublicId?: string;
  quote: string;
  speech: string;
  visible: boolean;
}

export interface CommitteeMember {
  id: string;
  name: string;
  designation: string;
  mobile: string;
  email: string;
  category?: string;
}

export interface CustomAboutSection {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  visible: boolean;
  members: CommitteeMember[];
}

export interface AlumniChapterItem {
  id: string;
  name: string;
  batch: string;
  achievement: string;
}

export interface FooterLinkItem {
  id: string;
  label: string;
  href: string;
  icon: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLinkItem[];
}

export interface CMSConfig {
  schoolName: string;
  siteTitle?: string;
  motto: string;
  crestUrl: string;
  crestPublicId?: string;
  faviconUrl: string;
  faviconPublicId?: string;
  eiin: string;
  boardCode: string;
  address: string;
  phone: string;
  email: string;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  headerLayout?: HeaderLayoutStyle;
  navMenuItems?: NavbarMenuItem[];
  showPrincipalCard?: boolean;
  principalName: string;
  principalDesignation: string;
  principalSubDesignation?: string;
  principalBadge?: string;
  principalPhotoUrl: string;
  principalPhotoPublicId?: string;
  principalQuote: string;
  principalNarrative: string;
  extraLeadershipCards?: LeadershipCard[];
  isAdmissionOpen: boolean;       // Controls glowing emerald pill on Homepage Header
  isResultsPublished: boolean;    // Controls sky-blue pill on Homepage Header
  isEmergencyAlert: boolean;      // Top banner broadcast toggle
  emergencyAlertText?: string;
  isMaintenanceMode: boolean;     // Public website maintenance mode toggle
  aboutContent: string;           // Independent About Page content
  atAGlanceHighlights?: Array<{ id: string; value: string; label: string; subtitle: string }>;
  smcMembers?: CommitteeMember[];
  customAboutSections?: CustomAboutSection[];
  academicsContent: string;       // Independent Academics Page content
  academicsPageConfig?: {
    heading: string;
    showRoutine: boolean;
    showFourthSubjectGuide: boolean;
  };
  alumniPageConfig?: {
    heading: string;
    subtitle: string;
    showRegistrationForm: boolean;
    featuredAlumni: AlumniChapterItem[];
  };
  contactPageConfig?: {
    heading: string;
    officeHours: string;
    mapNote: string;
    showInquiryForm: boolean;
  };
  footerColumns?: FooterColumn[];
  footerTagline?: string;
  copyrightText?: string;
  heroSlides: Array<{
    id: string;
    imageUrl: string;
    imagePublicId?: string;
    title: string;
    subtitle: string;
    badgeText: string;
  }>;
  stats: {
    enrolledStudents: string;
    certifiedFaculty: string;
    alumniNetwork: string;
  };
}

export type StaffCategory = 'Teacher' | 'Staff' | 'Teaching' | 'Administration' | 'Support';

export interface Teacher {
  id: string;
  name: string;
  banglaName?: string;
  staffCategory?: StaffCategory;
  rankOrder?: number;
  employeeId?: string;
  designation: string;
  department: string;
  mpoIndexNo?: string;
  qualification?: string;
  joiningDate?: string;
  employmentType?: 'Permanent' | 'Contractual' | 'Guest';
  shift?: ShiftType;
  gender?: GenderType;
  dateOfBirth?: string;
  bloodGroup?: string;
  nidNumber?: string;
  email: string;
  phone: string;
  presentAddress?: string;
  permanentAddress?: string;
  emergencyContact?: string;
  password?: string;
  systemPin?: string;
  avatarUrl: string;
  avatarPublicId?: string;
  signatureUrl?: string;
  signaturePublicId?: string;
  assignedClasses: Array<{
    className: string;
    sectionName: string;
    subjectId: string;
    subjectName: string;
  }>;
}

export interface StructuredAddress {
  division: string;
  district: string;
  upazila: string;
  customUpazila?: boolean;
  villageRoad: string;
  postOffice: string;
  postalCode: string;
}

export type StudentFieldVisibility = 'required' | 'optional' | 'hidden';
export type StudentFieldSection = 'photo' | 'academic' | 'personal' | 'parents' | 'address';

export type PromotionMode = 'merit' | 'keep-roll' | 'direct' | 'manual';

export interface StudentPromotionRecord {
  fromClass: string;
  toClass: string;
  fromSection?: string;
  toSection?: string;
  fromGroup?: AcademicGroup;
  toGroup?: AcademicGroup;
  fromRoll?: number;
  toRoll?: number;
  mode: PromotionMode;
  examId?: string;
  examTitle?: string;
  gpa?: number;
  date?: string;
  promotedAt?: string;
}

export type PromotionHistoryRecord = StudentPromotionRecord;

export type StudentFieldRequirement = 'required' | 'optional' | 'hidden';

export type StudentCoreFieldKey =
  | 'avatarUrl'
  | 'className'
  | 'group'
  | 'sectionName'
  | 'shift'
  | 'rollNumber'
  | 'registrationNumber'
  | 'systemId'
  | 'password'
  | 'phone'
  | 'fullName'
  | 'banglaName'
  | 'gender'
  | 'religionGroup'
  | 'dateOfBirth'
  | 'birthRegOrNid'
  | 'bloodGroup'
  | 'fatherName'
  | 'fatherBanglaName'
  | 'fatherNid'
  | 'fatherPhone'
  | 'fatherOccupation'
  | 'fatherProfession'
  | 'motherName'
  | 'motherBanglaName'
  | 'motherNid'
  | 'motherPhone'
  | 'motherOccupation'
  | 'motherProfession'
  | 'guardianInfo'
  | 'guardianName'
  | 'guardianRelation'
  | 'guardianPhone'
  | 'presentAddress'
  | 'permanentAddress';

export interface StudentSchemaCustomField {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  required?: boolean;
  requirement?: StudentFieldRequirement;
}

export interface StudentSchemaConfig {
  fields: Record<string, StudentFieldRequirement>;
  customFields?: StudentSchemaCustomField[];
}

export interface StudentFieldConfigItem {
  key: string;
  label: string;
  section: StudentFieldSection;
  visibility: StudentFieldVisibility;
  locked?: boolean;
  isCustom?: boolean;
}

export interface StudentFieldConfig {
  studentIdPrefix: string;
  fields: StudentFieldConfigItem[];
}

export interface Student {
  id: string;
  systemId: string; // e.g. BHS-2026-0001
  rollNumber: number;
  fullName: string;
  banglaName?: string;
  fatherName: string;
  fatherBanglaName?: string;
  fatherNid?: string;
  fatherPhone?: string;
  fatherOccupation?: string;
  motherName: string;
  motherBanglaName?: string;
  motherNid?: string;
  motherPhone?: string;
  motherOccupation?: string;
  hasLocalGuardian?: boolean;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  dateOfBirth: string;
  gender?: GenderType;
  bloodGroup?: string;
  birthRegOrNid?: string;
  className: string; // e.g. 'Class 9'
  sectionName: string; // 'A', 'B', 'Common'
  group: AcademicGroup;
  shift: ShiftType;
  religionGroup: ReligionGroup;
  batchCycle?: string;
  graduatedYear?: string;
  graduatedWing?: 'SSC' | 'HSC';
  electiveSubjectIds?: string[]; // Main group electives chosen by student (e.g. Biology, Civics)
  optionalFourthSubjectId?: string; // 4th Subject under NCTB standard
  status: 'Active' | 'Transferred' | 'Graduated' | 'Alumni';
  avatarUrl: string;
  avatarPublicId?: string;
  phone: string;
  address: string;
  presentAddress?: string;
  permanentAddress?: string;
  presentAddressDetail?: StructuredAddress;
  permanentAddressDetail?: StructuredAddress;
  sameAsPresentAddress?: boolean;
  previousInstitute?: string;
  previousGpa?: string;
  registrationNumber: string;
  password?: string;
  systemPin?: string;
  customFields?: Record<string, string>;
  promotionHistory?: StudentPromotionRecord[];
  updateRequest?: Partial<Student>;
  updateRequestStatus?: 'Pending' | 'Approved' | 'Rejected';
  updateRequestRejectionReason?: string;
}

export interface PromotionAssignment {
  studentId: string;
  targetSection: string;
  targetGroup: AcademicGroup;
  newRoll: number;
  gpa?: number;
  totalMarks?: number;
}

export interface PromotionPayload {
  studentIds: string[];
  targetClass: string;
  targetSection: string;
  targetGroup?: AcademicGroup;
  targetCycle?: string;
  mode: 'merit' | 'keep-roll' | 'direct';
  examId?: string;
  examTitle?: string;
  assignments: PromotionAssignment[];
}

export interface SubjectComponent {
  enabled?: boolean;
  fullMarks: number;
  passMarks: number;
  conversionPercent?: number;
}

export interface CustomSubjectComponent {
  id: string;
  label: string;
  enabled: boolean;
  fullMarks: number;
  passMarks: number;
  conversionPercent?: number;
}

export interface Subject {
  id: string;
  order?: number;
  code: string;
  name: string;
  banglaName?: string;
  classLevel: string;
  group: AcademicGroup; // Primary group tag for backward compatibility
  applicableGroups?: AcademicGroup[]; // Multi-group routing (e.g. ['Business Studies', 'Humanities'] for Gen. Science 127)
  isCompulsory: boolean;
  canBeFourthSubject: boolean;
  religionRestriction?: ReligionGroup | null;
  genderRestriction?: SubjectGenderRestriction; // e.g. 'Female' for Home Science 151/273
  combinedPaperKey?: string; // e.g. 'bangla', 'english', 'hsc-physics'
  combinedPaperTitle?: string; // e.g. 'Bangla (1st & 2nd Combined)'
  paperNumber?: 1 | 2;
  excludeFromGpa?: boolean;
  components: {
    cq: SubjectComponent;       // Theory / Creative
    mcq: SubjectComponent;      // Multiple Choice
    practical: SubjectComponent;// Lab / Practical
    ct?: SubjectComponent;      // Subject-level Class Test
  };
  customComponents?: CustomSubjectComponent[];
  totalFullMarks: number;
  totalPassMarks: number;
}

export interface Signatory {
  id: string;
  title: string;
  name: string;
  designation: string;
  signatureImgUrl?: string;
  signaturePublicId?: string;
  enabled: boolean;
}

export type ClassCycleType = 'Academic Year' | 'Academic Session';

export type ClassSectionMode = 'shared' | 'per-group';

export interface AcademicClass {
  id: string;
  name: string;
  order?: number;
  cycleType?: ClassCycleType;
  activeCycle?: string;
  hasSections?: boolean;
  hasGroups?: boolean;
  sectionMode?: ClassSectionMode;
  groupSections?: Partial<Record<AcademicGroup, string[]>>;
  shifts: ShiftType[];
  sections: string[];
  groups: AcademicGroup[];
  monthlyFee?: number;
  admissionFee?: number;
}

export interface RoutinePeriodSlot {
  id: string;
  period: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
  label?: string;
}

export interface RoutineActivity {
  id: string;
  name: string;
  defaultRoom?: string;
  requiresTeacher: boolean;
}

export interface InstituteWingsConfig {
  school: boolean;
  college: boolean;
}

export interface InstituteRules {
  enabledWings?: InstituteWingsConfig;
  activeAcademicYear: string;
  activeCollegeSession: string;
  hscYear1Session?: string;
  hscYear2Session?: string;
  workingDays: string[];
  weekendDays: string[];
  enabledShifts: ShiftType[];
  shiftPeriodTemplates: Record<ShiftType, RoutinePeriodSlot[]>;
  routineActivities: RoutineActivity[];
  minAttendancePercent: number;
  passThresholdPercent: number;
  enableFourthSubjectBonus: boolean;
  componentWisePassRequired: boolean;
  combinePairedPapersInResult?: boolean;
  feeDueDayOfMonth?: number;
  lateFeeFineAmount?: number;
  promotionPolicyNote: string;
  studentFieldConfig?: StudentFieldConfig;
  studentIdPrefix?: string;
  teacherIdPrefix?: string;
  staffIdPrefix?: string;
  studentSchemaConfig?: StudentSchemaConfig;
}

export interface GroupPeriodAssignment {
  subjectName: string;
  teacherName: string;
  room?: string;
}

export interface ParallelRoutineSession {
  id: string;
  subjectName: string;
  teacherName: string;
  room?: string;
  targetGroups: AcademicGroup[]; // ['General'] = All Groups, or e.g. ['Business Studies', 'Humanities']
  religionFilter?: ReligionGroup | null;
  onlyEnrolledStudents?: boolean;
}

export interface ClassRoutinePeriod {
  period: string;
  time: string;
  endTime?: string;
  subjectName: string;
  teacherName: string;
  room?: string;
  isBreak?: boolean;
  isGroupSplit?: boolean;
  groupSplits?: Partial<Record<AcademicGroup, GroupPeriodAssignment>>;
  parallelSessions?: ParallelRoutineSession[];
}

export interface ClassRoutineDay {
  id: string;
  className: string;
  group?: AcademicGroup | 'All';
  sectionName: string;
  shift: ShiftType;
  day: string;
  periods: ClassRoutinePeriod[];
}

export interface ExamRoutineItem {
  id: string;
  date: string;
  time: string;
  subjectId: string;
  subjectName: string;
  className: string;
  group?: AcademicGroup;
  sectionName?: string;
  room?: string;
  inspectorTeacherId: string;
  entryDeadline: string;
}

export interface ExaminerAssignment {
  id: string;
  examId: string;
  className: string;
  sectionName: string;
  subjectId: string;
  teacherId: string;
  deadline?: string;
  assignedAt?: string;
}

export interface MarksheetCustomField {
  id: string;
  label: string;
  scope: 'exam-wide' | 'per-student';
  placement: 'student-grid' | 'footer-notes';
  defaultValue?: string;
}

export interface MarksheetTemplate {
  borderStyle?: 'classic-double' | 'modern-clean' | 'official-seal' | 'none';
  accentColor?: string;
  fontFamily?: 'sans' | 'serif';
  watermarkOpacity?: number;
  boardTitle?: string;
  headerSubtitle?: string;
  defaultWorkingDays?: number;
  showHeader?: boolean;
  showStudentPhoto?: boolean;
  showBanglaName?: boolean;
  showFatherMother?: boolean;
  showRollReg?: boolean;
  showClassSectionGroup?: boolean;
  showSystemId?: boolean;
  showDateOfBirth?: boolean;
  showGradingScale?: boolean;
  showSubjectCode?: boolean;
  showFullMarksCol?: boolean;
  showPassMarksCol?: boolean;
  showCombinedPaperDetails?: boolean;
  showGradePointCol?: boolean;
  showCoreGpaAndBonus?: boolean;
  showMeritRank?: boolean;
  showAttendanceConduct?: boolean;
  showQrVerification?: boolean;
  customFields?: MarksheetCustomField[];
}

export interface StudentMarksheetMeta {
  workingDays?: number;
  daysPresent?: number;
  conduct?: string;
  promotionStatus?: string;
  teacherRemark?: string;
  customValues?: Record<string, string>;
}

export interface SavedTabulationRecord {
  savedAt: string;
  savedBy?: string;
  academicYear?: string;
  term?: string;
  records: ExamResultRecord[];
  summary: {
    totalCandidates: number;
    passedCount: number;
    failedCount: number;
    aPlusCount: number;
  };
}

export interface Exam {
  id: string;
  title: string;
  academicYear: string;
  term: string;
  targetClasses?: string[]; // Classes eligible for this examination
  enableCT?: boolean; // When false/omitted: CT column is completely hidden
  ctMaxMarks?: number; // e.g. 20
  writtenRatioPercent?: number; // e.g. 80
  excludedSubjectIds?: string[]; // Specific subject IDs excluded from this exam (e.g. Agri/ICT circular)
  marksheetBgUrl?: string;
  marksheetBgPublicId?: string;
  stationeryMode: 'full-design' | 'pre-printed-overlay';
  signatories: Signatory[];
  marksheetTemplate?: MarksheetTemplate;
  studentMarksheetMeta?: Record<string, StudentMarksheetMeta>;
  status: 'Draft' | 'MarksEntry' | 'Locked' | 'Published';
  publishedAt?: string;
  scheduledPublishAt?: string;
  examRoutine?: ExamRoutineItem[];
  examinerAssignments?: ExaminerAssignment[];
  savedTabulation?: SavedTabulationRecord;
}

export interface MarkEntry {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  isAbsent?: boolean; // When true: Student was absent (red AB, GP 0, Grade F)
  ctMarks?: number; // Optional Class Test Marks
  cqMarks: number;
  mcqMarks: number;
  practicalMarks: number;
  customMarks?: Record<string, number>; // Raw entered marks keyed by CustomSubjectComponent.id
  totalMarks: number;
  gradePoint: number;
  letterGrade: string;
  isPassed: boolean;
  isOptionalFourth: boolean;
  isLocked: boolean;
  isSentToTabulation?: boolean;
  sentToTabulationAt?: string;
}

export interface ResultCustomComponentBreakdown {
  id: string;
  label: string;
  rawMarks: number;
  convertedMarks: number;
  fullMarks: number;
  passMarks: number;
  rawFullMarks: number;
  conversionPercent: number;
}

export interface ResultSubjectBreakdown {
  order?: number;
  subjectCode: string;
  subjectName: string;
  isAbsent?: boolean;
  ct?: number;
  ctRaw?: number;
  ctEnabled?: boolean;
  ctFull?: number;
  ctPass?: number;
  cq: number;
  cqPass: number;
  cqFull?: number;
  cqEnabled?: boolean;
  mcq: number;
  mcqPass: number;
  mcqFull?: number;
  mcqEnabled?: boolean;
  practical: number;
  practicalPass: number;
  practicalFull?: number;
  practicalEnabled?: boolean;
  customComponents?: ResultCustomComponentBreakdown[];
  total: number;
  fullMarks: number;
  passMarks?: number;
  gradePoint: number;
  letterGrade: string;
  isPassed: boolean;
  isFourthSubject: boolean;
  combinedPapers?: Array<{
    subjectCode: string;
    subjectName: string;
    isAbsent?: boolean;
    ct?: number;
    cq: number;
    mcq: number;
    practical: number;
    customComponents?: ResultCustomComponentBreakdown[];
    total: number;
    fullMarks: number;
  }>;
}

export interface ExamResultRecord {
  id: string;
  examId: string;
  examTitle: string;
  academicYear: string;
  studentId: string;
  systemId: string;
  rollNumber: number;
  studentName: string;
  fatherName: string;
  motherName: string;
  className: string;
  sectionName: string;
  group: AcademicGroup;
  shift: ShiftType;
  registrationNumber: string;
  subjects: ResultSubjectBreakdown[];
  totalMarksObtained: number;
  totalFullMarks: number;
  gpaWithoutFourth: number;
  fourthSubjectBonus: number;
  finalGPA: number;
  finalLetterGrade: string;
  isPassed: boolean;
  failedSubjectCodes: string[];
  classRank?: number; // Overall rank across the entire grade level (all sections)
  sectionRank?: number; // Rank within this student's section
  attendancePresent?: number;
  attendanceTotalDays?: number;
  conductGrade?: string; // e.g. 'Outstanding', 'Good'
  teacherRemarks?: string;
  publishedAt: string;
}

export interface Notice {
  id: string;
  title: string;
  category: 'all' | 'academic' | 'admissions' | 'examinations';
  publishDate: string;
  badge: 'New' | 'Exam' | 'Results' | 'Notice';
  description: string;
  fileName?: string;
  attachmentUrl?: string;
  attachmentPublicId?: string;
}

export interface AdmissionApplication {
  id: string;
  applicantName: string;
  applicantInitials: string;
  applicationCode: string;
  grade: string;
  appliedTime: string;
  score: string;
  status: 'Approved' | 'Under Review' | 'Pending' | 'Admitted';
  gender?: GenderType;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  religionGroup?: ReligionGroup;
  group?: AcademicGroup;
  assignedClass?: string;
  assignedSection?: string;
  assignedRoll?: number;
  customAnswers?: Record<string, string>;
}

export interface AdmissionFormConfig {
  heading: string;
  instructions: string;
  signatoryName: string;
  signatoryTitle: string;
  customFields: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}

export type AcademicEventCategory =
  | 'Class Days'
  | 'Holiday'
  | 'Exam'
  | 'Important Event'
  | 'Admission';

export interface AcademicEvent {
  id: string;
  title: string;
  day: string;
  month: string;
  type: 'Exam' | 'Public Live' | 'Internal' | 'Holiday' | 'Class Days' | 'Event';
  location: string;
  time: string;
  startDate?: string;
  endDate?: string;
  academicYear?: string;
  targetWing?: 'All' | 'School (Class 1–10)' | 'College (Class 11–12)';
  category?: AcademicEventCategory;
  description?: string;
  visibility?: 'Public & Portals' | 'Portals Only' | 'Admin Only';
}

export interface StudentInvoice {
  id: string;
  invoiceNo: string;
  studentId: string;
  studentName: string;
  rollNumber: number;
  className: string;
  sectionName: string;
  month: string;
  academicYear: string;
  totalPayable: number;
  paidAmount: number;
  status: 'Paid' | 'Partial' | 'Unpaid';
  paymentMethod?: 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank';
  transactionId?: string;
  paymentDate?: string;
}

export interface MfsGatewayConfig {
  defaultMonthlyFee: number;
  bkash: { enabled: boolean; merchantNumber: string; appKey: string; mode: 'Sandbox' | 'Live' };
  nagad: { enabled: boolean; merchantNumber: string; merchantId: string; mode: 'Sandbox' | 'Live' };
  rocket: { enabled: boolean; merchantNumber: string; billerId: string; mode: 'Sandbox' | 'Live' };
}

export interface SmsGatewayConfig {
  provider: 'BulkSMSBD' | 'SSLWireless' | 'Twilio' | 'CustomHTTP';
  senderId: string;
  endpointUrl: string;
  apiKeyConfigured: boolean;
  autoResultSms: boolean;
  autoFeeReceiptSms: boolean;
}

export interface SmsLog {
  id: string;
  recipientGroup: string;
  recipientCount: number;
  message: string;
  sentAt: string;
  status: 'Delivered' | 'Queued';
}

export interface AdminUserAccount {
  id: string;
  username: string;
  fullName: string;
  password: string;
  role: 'Admin' | 'Institute Manager' | 'Accountant';
  active: boolean;
}

