import { Db } from 'mongodb';
import {
  AcademicClass,
  AcademicEvent,
  AdminUserAccount,
  AdmissionApplication,
  AdmissionFormConfig,
  CMSConfig,
  ClassRoutineDay,
  Exam,
  ExamResultRecord,
  InstituteRules,
  MarkEntry,
  MfsGatewayConfig,
  Notice,
  SmsGatewayConfig,
  SmsLog,
  Student,
  StudentInvoice,
  Subject,
  Teacher,
} from '@/lib/types';
import {
  DEFAULT_ADMISSION_FORM_CONFIG,
  DEFAULT_CMS_CONFIG,
  DEFAULT_INSTITUTE_RULES,
  DEFAULT_MFS_CONFIG,
  DEFAULT_SMS_CONFIG,
  buildNctbPresetSeed,
} from '@/lib/defaults';
import { COLLECTIONS, bumpSyncVersion, getSyncMeta, isMongoConfigured } from './mongodb';
import { decryptAdminPin, isAdminSession, VerifiedSession } from './security';
import { isCloudinaryConfigured, destroyManyCloudinaryAssets, collectStudentMediaEntries, collectTeacherMediaEntries, collectExamMediaIds, collectCmsMediaIds, collectNoticeMediaEntries } from './cloudinary';

export interface StoredAdminUser extends AdminUserAccount {
  passwordHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredTeacher extends Teacher {
  passwordHash?: string;
  systemPinEnc?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredStudent extends Student {
  passwordHash?: string;
  systemPinEnc?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SettingsDocument {
  _id: string;
  cmsConfig: CMSConfig;
  instituteRules: InstituteRules;
  admissionFormConfig: AdmissionFormConfig;
  mfsConfig: MfsGatewayConfig;
  smsConfig: SmsGatewayConfig;
  updatedAt: string;
}

export interface DbStatusSummary {
  mongoConfigured: boolean;
  mongoConnected: boolean;
  localDbActive?: boolean;
  storageMode?: 'mongodb' | 'local';
  cloudinaryConfigured: boolean;
  needsInitialSetup: boolean;
  syncVersion: number;
  lastUpdatedAt: string;
  error?: string;
}

export function stripMongoDoc<T extends Record<string, unknown>>(doc: T): Omit<T, '_id'> {
  const copy = { ...doc };
  delete (copy as Record<string, unknown>)._id;
  return copy as Omit<T, '_id'>;
}

export function sanitizeAdminUserOut(user: StoredAdminUser): AdminUserAccount {
  const clean = stripMongoDoc(user as unknown as Record<string, unknown>) as unknown as StoredAdminUser;
  return {
    id: clean.id,
    username: clean.username,
    fullName: clean.fullName,
    password: '', // Never expose password or hash to client
    role: clean.role,
    active: clean.active,
  };
}

export function sanitizeTeacherOut(
  teacher: StoredTeacher,
  scopeOrIncludePrivate: boolean | 'admin' | 'self' | 'public' = true
): Teacher {
  const scope: 'admin' | 'self' | 'public' =
    scopeOrIncludePrivate === true
      ? 'admin'
      : scopeOrIncludePrivate === false
      ? 'public'
      : scopeOrIncludePrivate;

  const clean = stripMongoDoc(teacher as unknown as Record<string, unknown>) as unknown as StoredTeacher;
  const copy: Record<string, unknown> = { ...clean };
  delete copy.passwordHash;
  delete copy.password;
  delete copy.systemPinEnc;
  delete copy.systemPin;

  if (scope === 'public') {
    return {
      id: clean.id,
      name: clean.name,
      banglaName: clean.banglaName,
      staffCategory: clean.staffCategory || 'Teacher',
      rankOrder: clean.rankOrder,
      employeeId: clean.employeeId,
      designation: clean.designation,
      department: clean.department || '',
      qualification: clean.qualification,
      shift: clean.shift,
      email: '',
      phone: '',
      avatarUrl: clean.avatarUrl || '',
      assignedClasses: [],
    };
  }

  const adminPin =
    scope === 'admin'
      ? decryptAdminPin(clean.systemPinEnc) ||
        (typeof clean.systemPin === 'string' && /^\d{6}$/.test(clean.systemPin)
          ? clean.systemPin
          : '')
      : '';

  return {
    ...(copy as unknown as Teacher),
    password: '',
    ...(scope === 'admin' && adminPin ? { systemPin: adminPin } : {}),
  };
}

export function sanitizeStudentOut(
  student: StoredStudent,
  scope: 'admin' | 'teacher' | 'self' | 'alumni-public'
): Student {
  const clean = stripMongoDoc(student as unknown as Record<string, unknown>) as unknown as StoredStudent;
  const copy: Record<string, unknown> = { ...clean };
  delete copy.passwordHash;
  delete copy.password;
  delete copy.systemPinEnc;
  delete copy.systemPin;

  if (scope === 'alumni-public') {
    return {
      id: clean.id,
      systemId: clean.systemId,
      rollNumber: clean.rollNumber,
      fullName: clean.fullName,
      banglaName: clean.banglaName,
      fatherName: '',
      motherName: '',
      dateOfBirth: '',
      className: clean.className,
      sectionName: clean.sectionName,
      group: clean.group,
      shift: clean.shift,
      religionGroup: clean.religionGroup,
      batchCycle: clean.batchCycle,
      graduatedYear: clean.graduatedYear,
      graduatedWing: clean.graduatedWing,
      status: clean.status,
      avatarUrl: clean.avatarUrl || '',
      phone: '',
      address: '',
      registrationNumber: '',
    };
  }

  if (scope === 'teacher') {
    return {
      id: clean.id,
      systemId: clean.systemId,
      rollNumber: clean.rollNumber,
      fullName: clean.fullName,
      banglaName: clean.banglaName,
      fatherName: clean.fatherName || '',
      motherName: clean.motherName || '',
      dateOfBirth: clean.dateOfBirth || '',
      gender: clean.gender,
      className: clean.className,
      sectionName: clean.sectionName,
      group: clean.group,
      shift: clean.shift,
      religionGroup: clean.religionGroup,
      batchCycle: clean.batchCycle,
      status: clean.status,
      avatarUrl: clean.avatarUrl || '',
      phone: '',
      address: '',
      registrationNumber: clean.registrationNumber || '',
      electiveSubjectIds: clean.electiveSubjectIds,
      optionalFourthSubjectId: clean.optionalFourthSubjectId,
    };
  }

  const adminPin =
    scope === 'admin'
      ? decryptAdminPin(clean.systemPinEnc) ||
        (typeof clean.systemPin === 'string' && /^\d{6}$/.test(clean.systemPin)
          ? clean.systemPin
          : '')
      : '';

  return {
    ...(copy as unknown as Student),
    password: '',
    ...(scope === 'admin' && adminPin ? { systemPin: adminPin } : {}),
    updateRequest: clean.updateRequest
      ? (() => {
          const reqCopy = { ...clean.updateRequest };
          delete reqCopy.password;
          delete reqCopy.systemPin;
          return reqCopy;
        })()
      : undefined,
  };
}

export async function ensureSettingsDoc(db: Db): Promise<SettingsDocument> {
  const col = db.collection<SettingsDocument>(COLLECTIONS.SETTINGS);
  const existing = await col.findOne({ _id: 'primary' });
  if (existing) {
    return {
      _id: 'primary',
      cmsConfig: { ...DEFAULT_CMS_CONFIG, ...(existing.cmsConfig || {}) },
      instituteRules: {
        ...DEFAULT_INSTITUTE_RULES,
        ...(existing.instituteRules || {}),
        enabledWings: {
          school: existing.instituteRules?.enabledWings?.school ?? true,
          college: existing.instituteRules?.enabledWings?.college ?? true,
        },
      },
      admissionFormConfig: {
        ...DEFAULT_ADMISSION_FORM_CONFIG,
        ...(existing.admissionFormConfig || {}),
      },
      mfsConfig: { ...DEFAULT_MFS_CONFIG, ...(existing.mfsConfig || {}) },
      smsConfig: { ...DEFAULT_SMS_CONFIG, ...(existing.smsConfig || {}) },
      updatedAt: existing.updatedAt || new Date().toISOString(),
    };
  }

  const initial: SettingsDocument = {
    _id: 'primary',
    cmsConfig: DEFAULT_CMS_CONFIG,
    instituteRules: DEFAULT_INSTITUTE_RULES,
    admissionFormConfig: DEFAULT_ADMISSION_FORM_CONFIG,
    mfsConfig: DEFAULT_MFS_CONFIG,
    smsConfig: DEFAULT_SMS_CONFIG,
    updatedAt: new Date().toISOString(),
  };

  await col.updateOne({ _id: 'primary' }, { $setOnInsert: initial }, { upsert: true });
  return initial;
}

export async function getNeedsInitialAdminSetup(db: Db): Promise<boolean> {
  const count = await db.collection(COLLECTIONS.ADMIN_USERS).countDocuments();
  return count === 0;
}

export async function buildBootstrapPayload(db: Db, session: VerifiedSession | null) {
  const [settings, syncMeta, adminCount] = await Promise.all([
    ensureSettingsDoc(db),
    getSyncMeta(db),
    db.collection(COLLECTIONS.ADMIN_USERS).countDocuments(),
  ]);

  const [classes, subjects, routines, notices, events, rawExams] = await Promise.all([
    db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).find({}).sort({ order: 1, name: 1 }).toArray(),
    db.collection<Subject>(COLLECTIONS.SUBJECTS).find({}).sort({ order: 1, code: 1 }).toArray(),
    db.collection<ClassRoutineDay>(COLLECTIONS.CLASS_ROUTINES).find({}).toArray(),
    db.collection<Notice>(COLLECTIONS.NOTICES).find({}).sort({ id: -1 }).toArray(),
    db.collection<AcademicEvent>(COLLECTIONS.EVENTS).find({}).sort({ startDate: 1 }).toArray(),
    db.collection<Exam>(COLLECTIONS.EXAMS).find({}).toArray(),
  ]);

  const adminAuth = isAdminSession(session);
  const teacherAuth = session?.portal === 'teacher';
  const studentAuth = session?.portal === 'student';

  let teachers: Teacher[] = [];
  let students: Student[] = [];
  let admissions: AdmissionApplication[] = [];
  let exams: Exam[] = [];
  let markEntries: MarkEntry[] = [];
  let invoices: StudentInvoice[] = [];
  let smsLogs: SmsLog[] = [];
  let adminUsers: AdminUserAccount[] = [];
  let publishedResults: ExamResultRecord[] = [];

  if (adminAuth) {
    const [rawTeachers, rawStudents, rawAdmissions, rawMarks, rawInvoices, rawSmsLogs, rawAdmins, rawPubResults] =
      await Promise.all([
        db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).find({}).toArray(),
        db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find({}).toArray(),
        db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS).find({}).toArray(),
        db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).find({}).toArray(),
        db.collection<StudentInvoice>(COLLECTIONS.INVOICES).find({}).toArray(),
        db.collection<SmsLog>(COLLECTIONS.SMS_LOGS).find({}).sort({ id: -1 }).toArray(),
        db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS).find({}).toArray(),
        db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS).find({}).toArray(),
      ]);

    teachers = rawTeachers.map((t) => sanitizeTeacherOut(t, 'admin'));
    students = rawStudents.map((s) => sanitizeStudentOut(s, 'admin'));
    admissions = rawAdmissions.map((a) => stripMongoDoc(a as unknown as Record<string, unknown>) as unknown as AdmissionApplication);
    exams = rawExams.map((e) => stripMongoDoc(e as unknown as Record<string, unknown>) as unknown as Exam);
    markEntries = rawMarks.map((m) => stripMongoDoc(m as unknown as Record<string, unknown>) as unknown as MarkEntry);
    invoices = rawInvoices.map((i) => stripMongoDoc(i as unknown as Record<string, unknown>) as unknown as StudentInvoice);
    smsLogs = rawSmsLogs.map((l) => stripMongoDoc(l as unknown as Record<string, unknown>) as unknown as SmsLog);
    adminUsers = rawAdmins.map((u) => sanitizeAdminUserOut(u));
    publishedResults = rawPubResults.map((r) => stripMongoDoc(r as unknown as Record<string, unknown>) as unknown as ExamResultRecord);
  } else if (teacherAuth && session) {
    const [rawTeachers, rawStudents, rawMarks] = await Promise.all([
      db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).find({}).toArray(),
      db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find({}).toArray(),
      db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).find({}).toArray(),
    ]);

    teachers = rawTeachers.map((t) => sanitizeTeacherOut(t, t.id === session.userId ? 'self' : 'public'));
    students = rawStudents.map((s) => sanitizeStudentOut(s, 'teacher'));
    exams = rawExams.map((e) => stripMongoDoc(e as unknown as Record<string, unknown>) as unknown as Exam);
    markEntries = rawMarks.map((m) => stripMongoDoc(m as unknown as Record<string, unknown>) as unknown as MarkEntry);
  } else if (studentAuth && session) {
    const [selfStudent, rawTeachers, rawMarks, rawInvoices, rawPubResults] = await Promise.all([
      db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne({ id: session.userId }),
      db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).find({}).toArray(),
      db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).find({ studentId: session.userId }).toArray(),
      db.collection<StudentInvoice>(COLLECTIONS.INVOICES).find({ studentId: session.userId }).toArray(),
      db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS).find({ studentId: session.userId }).toArray(),
    ]);

    students = selfStudent ? [sanitizeStudentOut(selfStudent, 'self')] : [];
    teachers = rawTeachers.map((t) => sanitizeTeacherOut(t, 'public'));
    exams = rawExams
      .filter((e) => e.status === 'Published')
      .map((e) => stripMongoDoc(e as unknown as Record<string, unknown>) as unknown as Exam);
    markEntries = rawMarks.map((m) => stripMongoDoc(m as unknown as Record<string, unknown>) as unknown as MarkEntry);
    invoices = rawInvoices.map((i) => stripMongoDoc(i as unknown as Record<string, unknown>) as unknown as StudentInvoice);
    publishedResults = rawPubResults.map((r) => stripMongoDoc(r as unknown as Record<string, unknown>) as unknown as ExamResultRecord);
  } else {
    // Public unauthenticated scope: only non-sensitive public portal data
    const [rawTeachers, rawAlumni, rawPubResults] = await Promise.all([
      db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).find({}).toArray(),
      db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find({ status: 'Alumni' }).toArray(),
      db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS).find({}).toArray(),
    ]);

    teachers = rawTeachers.map((t) => sanitizeTeacherOut(t, 'public'));
    students = rawAlumni.map((s) => sanitizeStudentOut(s, 'alumni-public'));
    exams = rawExams
      .filter((e) => e.status === 'Published')
      .map((e) => ({
        ...stripMongoDoc(e as unknown as Record<string, unknown>),
        examinerAssignments: undefined,
      }) as unknown as Exam);
    publishedResults = rawPubResults.map((r) => stripMongoDoc(r as unknown as Record<string, unknown>) as unknown as ExamResultRecord);
  }

  // Compute live accurate stats dynamically if CMS stats haven't been customized manually or alongside CMS
  return {
    state: {
      cmsConfig: settings.cmsConfig,
      instituteRules: settings.instituteRules,
      notices: notices.map((n) => stripMongoDoc(n as unknown as Record<string, unknown>)),
      admissions,
      admissionFormConfig: settings.admissionFormConfig,
      events: events.map((ev) => stripMongoDoc(ev as unknown as Record<string, unknown>)),
      academicClasses: classes.map((c) => stripMongoDoc(c as unknown as Record<string, unknown>)),
      classRoutines: routines.map((r) => stripMongoDoc(r as unknown as Record<string, unknown>)),
      teachers,
      subjects: subjects.map((s) => stripMongoDoc(s as unknown as Record<string, unknown>)),
      students,
      exams,
      markEntries,
      invoices,
      mfsConfig: settings.mfsConfig,
      smsConfig: settings.smsConfig,
      smsLogs,
      adminUsers,
      publishedResults,
    },
    dbStatus: {
      mongoConfigured: isMongoConfigured(),
      mongoConnected: isMongoConfigured(),
      localDbActive: !isMongoConfigured(),
      storageMode: isMongoConfigured() ? 'mongodb' : 'local',
      cloudinaryConfigured: isCloudinaryConfigured(),
      needsInitialSetup: adminCount === 0,
      syncVersion: syncMeta.version,
      lastUpdatedAt: syncMeta.updatedAt,
    } satisfies DbStatusSummary,
    session,
  };
}

export async function seedNctbPresetsToDb(db: Db): Promise<{
  classesInserted: number;
  subjectsInserted: number;
}> {
  const settings = await ensureSettingsDoc(db);
  const { classes, subjects } = buildNctbPresetSeed(settings.instituteRules);

  let classesInserted = 0;
  for (const cls of classes) {
    const res = await db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).updateOne(
      { name: cls.name },
      { $setOnInsert: cls },
      { upsert: true }
    );
    if (res.upsertedCount > 0) classesInserted++;
  }

  let subjectsInserted = 0;
  for (const sub of subjects) {
    const res = await db.collection<Subject>(COLLECTIONS.SUBJECTS).updateOne(
      { classLevel: sub.classLevel, code: sub.code },
      { $setOnInsert: sub },
      { upsert: true }
    );
    if (res.upsertedCount > 0) subjectsInserted++;
  }

  await bumpSyncVersion(db, 'academics');
  return { classesInserted, subjectsInserted };
}

export async function resetOperationalDataInDb(
  db: Db,
  includeAcademicStructure = false
): Promise<{ clearedCollections: string[] }> {
  // Clean up Cloudinary media owned by operational records before wiping collections
  const [students, teachers, exams, notices] = await Promise.all([
    db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find({}).toArray(),
    db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).find({}).toArray(),
    db.collection<Exam>(COLLECTIONS.EXAMS).find({}).toArray(),
    db.collection<Notice>(COLLECTIONS.NOTICES).find({}).toArray(),
  ]);

  const mediaToDelete: Array<{ publicId?: string | null; url?: string | null }> = [];
  for (const s of students) mediaToDelete.push(...collectStudentMediaEntries(s));
  for (const t of teachers) mediaToDelete.push(...collectTeacherMediaEntries(t));
  for (const e of exams) {
    for (const pid of collectExamMediaIds(e)) mediaToDelete.push({ publicId: pid });
  }
  for (const n of notices) mediaToDelete.push(...collectNoticeMediaEntries(n));

  await destroyManyCloudinaryAssets(mediaToDelete);

  const opsToClear: string[] = [
    COLLECTIONS.STUDENTS,
    COLLECTIONS.TEACHERS,
    COLLECTIONS.ADMISSIONS,
    COLLECTIONS.EXAMS,
    COLLECTIONS.MARK_ENTRIES,
    COLLECTIONS.PUBLISHED_RESULTS,
    COLLECTIONS.INVOICES,
    COLLECTIONS.NOTICES,
    COLLECTIONS.EVENTS,
    COLLECTIONS.SMS_LOGS,
  ];
  if (includeAcademicStructure) {
    opsToClear.push(
      COLLECTIONS.ACADEMIC_CLASSES,
      COLLECTIONS.SUBJECTS,
      COLLECTIONS.CLASS_ROUTINES
    );
  }

  await Promise.all(opsToClear.map((col) => db.collection(col).deleteMany({})));
  await bumpSyncVersion(db, 'system');
  return { clearedCollections: opsToClear };
}

export async function cleanupCmsRemovedMedia(previousCms: CMSConfig, nextCms: CMSConfig) {
  const oldIds = collectCmsMediaIds(previousCms);
  const newIds = collectCmsMediaIds(nextCms);
  const removed: Array<{ publicId: string }> = [];
  for (const oldId of oldIds) {
    if (!newIds.has(oldId)) {
      removed.push({ publicId: oldId });
    }
  }
  if (removed.length > 0) {
    await destroyManyCloudinaryAssets(removed);
  }
}

export async function cleanupExamRemovedMedia(previousExam: Exam, nextExam?: Exam | null) {
  const oldIds = collectExamMediaIds(previousExam);
  const newIds = nextExam ? collectExamMediaIds(nextExam) : new Set<string>();
  const removed: Array<{ publicId: string }> = [];
  for (const oldId of oldIds) {
    if (!newIds.has(oldId)) {
      removed.push({ publicId: oldId });
    }
  }
  if (removed.length > 0) {
    await destroyManyCloudinaryAssets(removed);
  }
}
