'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  CMSConfig,
  Teacher,
  Student,
  Subject,
  Exam,
  MarkEntry,
  Notice,
  AdmissionApplication,
  AcademicEvent,
  StudentInvoice,
  ExamResultRecord,
  AcademicClass,
  ClassRoutineDay,
  AdmissionFormConfig,
  MfsGatewayConfig,
  SmsGatewayConfig,
  SmsLog,
  AdminUserAccount,
  ShiftType,
  AcademicGroup,
  InstituteRules,
  ExaminerAssignment,
  ExamRoutineItem,
  SavedTabulationRecord,
} from './types';
import {
  DEFAULT_ADMISSION_FORM_CONFIG,
  DEFAULT_CMS_CONFIG,
  DEFAULT_INSTITUTE_RULES,
  DEFAULT_MFS_CONFIG,
  DEFAULT_SMS_CONFIG,
} from './defaults';
import { compileStudentExamRecord } from './grading-engine';
import {
  formatTime12h,
  isCollegeClassName,
  isHscYear2ClassName,
  isStudentGenderEligibleForSubject,
  resolveDefaultBatchCycle,
  sortSubjectsByOrder,
  subjectAppliesToGroup,
} from './academic-helpers';
import { getNextStudentSystemIdFromStudents } from './student-schema';

export type UserRole = 'Admin' | 'Institute Manager' | 'Accountant' | 'Teacher';

export interface AuthUser {
  username: string;
  role: UserRole;
  isLoggedIn: boolean;
}

export interface VerifiedClientSession {
  portal: 'admin' | 'teacher' | 'student';
  userId: string;
  username: string;
  role: UserRole | 'Student';
  exp?: number;
}

export interface DbStatusState {
  mongoConfigured: boolean;
  mongoConnected: boolean;
  localDbActive?: boolean;
  storageMode?: 'mongodb' | 'local';
  cloudinaryConfigured: boolean;
  needsInitialSetup: boolean;
  syncVersion: number;
  lastUpdatedAt: string;
  error?: string;
  lastMutationError?: string;
}

export interface AppState {
  cmsConfig: CMSConfig;
  instituteRules: InstituteRules;
  notices: Notice[];
  admissions: AdmissionApplication[];
  admissionFormConfig: AdmissionFormConfig;
  events: AcademicEvent[];
  academicClasses: AcademicClass[];
  classRoutines: ClassRoutineDay[];
  teachers: Teacher[];
  subjects: Subject[];
  students: Student[];
  exams: Exam[];
  markEntries: MarkEntry[];
  invoices: StudentInvoice[];
  mfsConfig: MfsGatewayConfig;
  smsConfig: SmsGatewayConfig;
  smsLogs: SmsLog[];
  adminUsers: AdminUserAccount[];
  publishedResults: ExamResultRecord[];
  currentUser: AuthUser;
}

const DEFAULT_UNAUTH_USER: AuthUser = {
  username: '',
  role: 'Teacher',
  isLoggedIn: false,
};

function createEmptyState(): AppState {
  return {
    cmsConfig: DEFAULT_CMS_CONFIG,
    instituteRules: DEFAULT_INSTITUTE_RULES,
    notices: [],
    admissions: [],
    admissionFormConfig: DEFAULT_ADMISSION_FORM_CONFIG,
    events: [],
    academicClasses: [],
    classRoutines: [],
    teachers: [],
    subjects: [],
    students: [],
    exams: [],
    markEntries: [],
    invoices: [],
    mfsConfig: DEFAULT_MFS_CONFIG,
    smsConfig: DEFAULT_SMS_CONFIG,
    smsLogs: [],
    adminUsers: [],
    publishedResults: [],
    currentUser: DEFAULT_UNAUTH_USER,
  };
}

const SERVER_SNAPSHOT: AppState = createEmptyState();
const INITIAL_DB_STATUS: DbStatusState = {
  mongoConfigured: false,
  mongoConnected: false,
  localDbActive: false,
  cloudinaryConfigured: false,
  needsInitialSetup: false,
  syncVersion: 0,
  lastUpdatedAt: '',
};

let globalState: AppState = SERVER_SNAPSHOT;
let globalDbStatus: DbStatusState = INITIAL_DB_STATUS;
let globalSession: VerifiedClientSession | null = null;
let hasHydratedFromServer = false;
let inFlightBootstrap: Promise<void> | null = null;
let pendingMutationCount = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
let mountedHooksCount = 0;
let syncTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return globalState;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function getHydratedSnapshot() {
  return hasHydratedFromServer;
}

function getHydratedServerSnapshot() {
  return false;
}

function getDbStatusSnapshot() {
  return globalDbStatus;
}

function getDbStatusServerSnapshot() {
  return INITIAL_DB_STATUS;
}

function getSessionSnapshot() {
  return globalSession;
}

function getSessionServerSnapshot() {
  return null;
}

function notify() {
  globalState = { ...globalState };
  listeners.forEach((l) => l());
}

function normalizeServerState(
  rawState: Partial<AppState> | undefined,
  session: VerifiedClientSession | null
): AppState {
  const base = createEmptyState();
  const parsed = rawState || {};

  const parsedCms = parsed.cmsConfig || ({} as Partial<CMSConfig>);
  const parsedRules = parsed.instituteRules || ({} as Partial<InstituteRules>);

  const normalizedRules: InstituteRules = {
    ...base.instituteRules,
    ...parsedRules,
    enabledWings: {
      school: parsedRules.enabledWings?.school ?? true,
      college: parsedRules.enabledWings?.college ?? true,
    },
    hscYear1Session:
      parsedRules.hscYear1Session || parsedRules.activeCollegeSession || base.instituteRules.hscYear1Session,
    hscYear2Session:
      parsedRules.hscYear2Session || parsedRules.activeCollegeSession || base.instituteRules.hscYear2Session,
    shiftPeriodTemplates: {
      Morning: (parsedRules.shiftPeriodTemplates?.Morning || base.instituteRules.shiftPeriodTemplates.Morning).map(
        (slot) => ({
          ...slot,
          startTime: formatTime12h(slot.startTime),
          endTime: formatTime12h(slot.endTime),
        })
      ),
      Day: (parsedRules.shiftPeriodTemplates?.Day || base.instituteRules.shiftPeriodTemplates.Day).map(
        (slot) => ({
          ...slot,
          startTime: formatTime12h(slot.startTime),
          endTime: formatTime12h(slot.endTime),
        })
      ),
    },
  };

  const currentUser: AuthUser =
    session && session.portal === 'admin'
      ? {
          username: session.username,
          role: session.role as UserRole,
          isLoggedIn: true,
        }
      : DEFAULT_UNAUTH_USER;

  return {
    ...base,
    ...parsed,
    cmsConfig: {
      ...base.cmsConfig,
      ...parsedCms,
      stats: {
        ...base.cmsConfig.stats,
        ...(parsedCms.stats || {}),
      },
      academicsPageConfig: {
        ...base.cmsConfig.academicsPageConfig!,
        ...(parsedCms.academicsPageConfig || {}),
      },
      alumniPageConfig: {
        ...base.cmsConfig.alumniPageConfig!,
        ...(parsedCms.alumniPageConfig || {}),
        featuredAlumni:
          parsedCms.alumniPageConfig?.featuredAlumni ?? base.cmsConfig.alumniPageConfig!.featuredAlumni,
      },
      contactPageConfig: {
        ...base.cmsConfig.contactPageConfig!,
        ...(parsedCms.contactPageConfig || {}),
      },
    },
    instituteRules: normalizedRules,
    admissionFormConfig: { ...base.admissionFormConfig, ...(parsed.admissionFormConfig || {}) },
    mfsConfig: { ...base.mfsConfig, ...(parsed.mfsConfig || {}) },
    smsConfig: { ...base.smsConfig, ...(parsed.smsConfig || {}) },
    currentUser,
  };
}

async function safeParseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return {
      error: `Server returned an HTML response (HTTP ${res.status}) instead of JSON. If the server just restarted or timed out reaching MongoDB, click Retry Connection.`,
    };
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: `Invalid JSON response (HTTP ${res.status}).` };
  }
}

export async function refreshFromServer(): Promise<void> {
  if (inFlightBootstrap) return inFlightBootstrap;
  inFlightBootstrap = (async () => {
    try {
      const res = await fetch('/api/bootstrap', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await safeParseJsonResponse(res);
      if (json.dbStatus) {
        globalDbStatus = {
          ...(json.dbStatus as DbStatusState),
          lastMutationError: globalDbStatus.lastMutationError,
        };
      } else if (!res.ok || json.error) {
        globalDbStatus = {
          ...globalDbStatus,
          mongoConnected: false,
          error:
            (typeof json.error === 'string' && json.error) ||
            `Server returned HTTP ${res.status}`,
        };
      }
      if ('session' in json) {
        globalSession = (json.session as VerifiedClientSession | null) || null;
      }
      if (json.state && pendingMutationCount === 0) {
        globalState = normalizeServerState(json.state as Partial<AppState>, globalSession);
      }
    } catch (err) {
      globalDbStatus = {
        ...globalDbStatus,
        mongoConnected: false,
        error: err instanceof Error ? err.message : 'Failed to reach server',
      };
    } finally {
      hasHydratedFromServer = true;
      inFlightBootstrap = null;
      listeners.forEach((l) => l());
    }
  })();
  return inFlightBootstrap;
}

const clearDbError = () => {
  if (!globalDbStatus.lastMutationError) return;
  globalDbStatus = { ...globalDbStatus, lastMutationError: undefined };
  listeners.forEach((l) => l());
};

async function checkSyncTick(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (pendingMutationCount > 0) return;
  if (!globalDbStatus.mongoConfigured && !globalDbStatus.localDbActive) return;
  try {
    const res = await fetch('/api/sync/version', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await safeParseJsonResponse(res);
    if (
      pendingMutationCount === 0 &&
      typeof data.version === 'number' &&
      data.version >= 0 &&
      data.version !== globalDbStatus.syncVersion
    ) {
      await refreshFromServer();
    }
  } catch {
    // Silent background poll failure
  }
}

interface ServerMutationResult {
  ok?: boolean;
  error?: string;
  data?: unknown;
  syncVersion?: number;
}

function postSerializedServer(
  url: string,
  bodyObj: Record<string, unknown>,
  label: string
): Promise<ServerMutationResult> {
  pendingMutationCount += 1;
  const task = mutationQueue.then(async (): Promise<ServerMutationResult> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify(bodyObj),
      });
      const json = (await safeParseJsonResponse(res)) as ServerMutationResult;
      if (res.ok && json.ok) {
        globalDbStatus = {
          ...globalDbStatus,
          lastMutationError: undefined,
          ...(typeof json.syncVersion === 'number' ? { syncVersion: json.syncVersion } : {}),
        };
        return json;
      }
      const errMsg = json.error || `Failed to save changes (${label}, HTTP ${res.status}).`;
      console.error(`ERP mutation failed (${label}):`, errMsg);
      globalDbStatus = { ...globalDbStatus, lastMutationError: errMsg };
      listeners.forEach((l) => l());
      return { ...json, ok: false, error: errMsg };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error while saving changes.';
      console.error(`Network error during ERP mutation (${label}):`, errMsg);
      globalDbStatus = { ...globalDbStatus, lastMutationError: errMsg };
      listeners.forEach((l) => l());
      return { ok: false, error: errMsg };
    } finally {
      pendingMutationCount = Math.max(0, pendingMutationCount - 1);
      if (pendingMutationCount === 0) {
        void refreshFromServer();
      }
    }
  });
  mutationQueue = task.catch(() => undefined);
  return task;
}

function mutateServer(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<ServerMutationResult> {
  return postSerializedServer('/api/erp/mutate', { action, payload }, action);
}

const uidSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const getNextStudentSystemId = (offset = 0) => {
  const academicYear =
    globalState.instituteRules.activeAcademicYear || new Date().getFullYear();
  return getNextStudentSystemIdFromStudents(
    globalState.students,
    globalState.instituteRules.studentIdPrefix,
    academicYear,
    offset
  );
};

const getNextInvoiceNumber = (offset = 0) => {
  const currentYear = new Date().getFullYear();
  let maxNum = 0;
  for (const inv of globalState.invoices) {
    const m = String(inv.invoiceNo || '').match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `INV-${currentYear}-${String(maxNum + 1 + offset).padStart(3, '0')}`;
};

// --- Action Mutators (Optimistic UI + Atomic MongoDB API Sync) ---

const updateCMSConfig = (updates: Partial<CMSConfig>) => {
  globalState.cmsConfig = { ...globalState.cmsConfig, ...updates };
  notify();
  void mutateServer('updateCMSConfig', { updates });
};

const updateInstituteRules = (updates: Partial<InstituteRules>) => {
  globalState.instituteRules = { ...globalState.instituteRules, ...updates };
  notify();
  void mutateServer('updateInstituteRules', { updates });
};

const syncSchoolAcademicYearToClasses = (activeYear: string) => {
  const nextYear = activeYear.trim() || globalState.instituteRules.activeAcademicYear;
  globalState.instituteRules = { ...globalState.instituteRules, activeAcademicYear: nextYear };
  globalState.academicClasses = globalState.academicClasses.map((cls) =>
    !isCollegeClassName(cls.name) ? { ...cls, activeCycle: nextYear, cycleType: 'Academic Year' } : cls
  );
  notify();
  void mutateServer('syncSchoolAcademicYearToClasses', { activeYear: nextYear });
};

const syncCollegeSessionsToClasses = (hscYear1Session: string, hscYear2Session?: string) => {
  const y1 =
    hscYear1Session.trim() ||
    globalState.instituteRules.hscYear1Session ||
    globalState.instituteRules.activeCollegeSession;
  const y2 =
    (hscYear2Session ?? '').trim() ||
    globalState.instituteRules.hscYear2Session ||
    globalState.instituteRules.activeCollegeSession;

  globalState.instituteRules = {
    ...globalState.instituteRules,
    activeCollegeSession: y1,
    hscYear1Session: y1,
    hscYear2Session: y2,
  };
  globalState.academicClasses = globalState.academicClasses.map((cls) => {
    if (!isCollegeClassName(cls.name)) return cls;
    const cycle = isHscYear2ClassName(cls.name) ? y2 : y1;
    return { ...cls, activeCycle: cycle, cycleType: 'Academic Session' };
  });
  notify();
  void mutateServer('syncCollegeSessionsToClasses', { hscYear1Session: y1, hscYear2Session: y2 });
};

const toggleAdmissionBadge = () => {
  globalState.cmsConfig = { ...globalState.cmsConfig, isAdmissionOpen: !globalState.cmsConfig.isAdmissionOpen };
  notify();
  void mutateServer('toggleAdmissionBadge');
};

const toggleResultsBadge = () => {
  globalState.cmsConfig = {
    ...globalState.cmsConfig,
    isResultsPublished: !globalState.cmsConfig.isResultsPublished,
  };
  notify();
  void mutateServer('toggleResultsBadge');
};

const toggleEmergencyAlert = () => {
  globalState.cmsConfig = { ...globalState.cmsConfig, isEmergencyAlert: !globalState.cmsConfig.isEmergencyAlert };
  notify();
  void mutateServer('toggleEmergencyAlert');
};

const addNotice = (notice: Omit<Notice, 'id' | 'publishDate'>) => {
  const newNotice: Notice = {
    ...notice,
    id: `not-${uidSuffix()}`,
    publishDate: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }),
  };
  globalState.notices = [newNotice, ...globalState.notices];
  notify();
  void mutateServer('addNotice', { notice: newNotice });
};

const deleteNotice = (id: string) => {
  globalState.notices = globalState.notices.filter((n) => n.id !== id);
  notify();
  void mutateServer('deleteNotice', { id });
};

const addAcademicClass = (cls: Omit<AcademicClass, 'id'>) => {
  const cleanName = cls.name.trim();
  if (globalState.academicClasses.some((c) => c.name.trim().toLowerCase() === cleanName.toLowerCase())) {
    return null;
  }
  const newCls: AcademicClass = { ...cls, name: cleanName, id: `cls-${uidSuffix()}` };
  globalState.academicClasses = [...globalState.academicClasses, newCls].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999)
  );
  notify();
  void mutateServer('addAcademicClass', { cls: newCls });
  return newCls;
};

const updateAcademicClass = (id: string, updates: Partial<AcademicClass>): boolean => {
  const existing = globalState.academicClasses.find((c) => c.id === id);
  if (!existing) return false;
  const nextName = (updates.name ?? existing.name).trim();
  if (
    globalState.academicClasses.some(
      (c) => c.id !== id && c.name.trim().toLowerCase() === nextName.toLowerCase()
    )
  ) {
    return false;
  }
  const oldName = existing.name;
  globalState.academicClasses = globalState.academicClasses
    .map((c) => (c.id === id ? { ...c, ...updates, name: nextName } : c))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  if (oldName !== nextName) {
    globalState.students = globalState.students.map((s) =>
      s.className === oldName ? { ...s, className: nextName } : s
    );
    globalState.subjects = globalState.subjects.map((sub) =>
      sub.classLevel === oldName ? { ...sub, classLevel: nextName } : sub
    );
    globalState.classRoutines = globalState.classRoutines.map((r) =>
      r.className === oldName ? { ...r, className: nextName } : r
    );
  }
  notify();
  void mutateServer('updateAcademicClass', { id, updates });
  return true;
};

const deleteAcademicClass = (id: string) => {
  globalState.academicClasses = globalState.academicClasses.filter((c) => c.id !== id);
  notify();
  void mutateServer('deleteAcademicClass', { id });
};

const addSubject = (sub: Omit<Subject, 'id'>) => {
  const duplicate = globalState.subjects.find(
    (s) => s.classLevel === sub.classLevel && s.code.trim().toLowerCase() === sub.code.trim().toLowerCase()
  );
  if (duplicate) return null;
  const classMaxOrder = globalState.subjects
    .filter((s) => s.classLevel === sub.classLevel)
    .reduce((max, s) => (typeof s.order === 'number' && s.order > max ? s.order : max), 0);
  const created: Subject = {
    ...sub,
    order: typeof sub.order === 'number' && Number.isFinite(sub.order) ? sub.order : classMaxOrder + 1,
    id: `sub-${sub.code}-${uidSuffix()}`,
  };
  globalState.subjects = sortSubjectsByOrder([...globalState.subjects, created]);
  notify();
  void mutateServer('addSubject', { subject: created });
  return created;
};

const updateSubject = (id: string, updates: Partial<Subject>): boolean => {
  const existing = globalState.subjects.find((s) => s.id === id);
  if (!existing) return false;
  const nextClass = updates.classLevel ?? existing.classLevel;
  const nextCode = (updates.code ?? existing.code).trim().toLowerCase();
  if (
    globalState.subjects.some(
      (s) => s.id !== id && s.classLevel === nextClass && s.code.trim().toLowerCase() === nextCode
    )
  ) {
    return false;
  }
  globalState.subjects = sortSubjectsByOrder(
    globalState.subjects.map((s) => (s.id === id ? { ...s, ...updates } : s))
  );
  notify();
  void mutateServer('updateSubject', { id, updates });
  return true;
};

const cloneSubjectsToClass = (sourceClass: string, targetClass: string): number => {
  if (!sourceClass || !targetClass || sourceClass === targetClass) return 0;
  const sourceSubjects = globalState.subjects.filter((s) => s.classLevel === sourceClass);
  const targetClsObj = globalState.academicClasses.find((c) => c.name === targetClass);
  const existingCodes = new Set(
    globalState.subjects.filter((s) => s.classLevel === targetClass).map((s) => s.code.trim().toLowerCase())
  );
  const toAdd: Subject[] = [];
  sourceSubjects.forEach((sub, idx) => {
    if (existingCodes.has(sub.code.trim().toLowerCase())) return;
    const isNoGroupClass = targetClsObj && targetClsObj.hasGroups === false;
    const validGroup = isNoGroupClass ? 'General' : sub.group;
    toAdd.push({
      ...sub,
      id: `sub-${sub.code}-${uidSuffix()}-${idx}`,
      classLevel: targetClass,
      group: validGroup,
      applicableGroups: isNoGroupClass ? ['General'] : sub.applicableGroups?.length ? [...sub.applicableGroups] : [validGroup],
    });
  });
  if (toAdd.length > 0) {
    globalState.subjects = [...globalState.subjects, ...toAdd];
    notify();
    void mutateServer('cloneSubjectsToClass', { sourceClass, targetClass });
  }
  return toAdd.length;
};

const bulkAddSubjects = (classLevel: string, items: Array<Omit<Subject, 'id' | 'classLevel'>>): number => {
  if (!classLevel || items.length === 0) return 0;
  const targetClsObj = globalState.academicClasses.find((c) => c.name === classLevel);
  const existingCodes = new Set(
    globalState.subjects.filter((s) => s.classLevel === classLevel).map((s) => s.code.trim().toLowerCase())
  );
  const classMaxOrder = globalState.subjects
    .filter((s) => s.classLevel === classLevel)
    .reduce((max, s) => (typeof s.order === 'number' && s.order > max ? s.order : max), 0);
  const toAdd: Subject[] = [];
  items.forEach((sub, idx) => {
    const codeKey = sub.code.trim().toLowerCase();
    if (!codeKey || existingCodes.has(codeKey)) return;
    existingCodes.add(codeKey);
    const isNoGroupClass = targetClsObj && targetClsObj.hasGroups === false;
    const validGroup = isNoGroupClass ? 'General' : sub.group;
    toAdd.push({
      ...sub,
      order: typeof sub.order === 'number' ? sub.order : classMaxOrder + toAdd.length + 1,
      id: `sub-${sub.code}-${uidSuffix()}-${idx}`,
      classLevel,
      group: validGroup,
      applicableGroups: isNoGroupClass ? ['General'] : sub.applicableGroups?.length ? [...sub.applicableGroups] : [validGroup],
    });
  });
  if (toAdd.length > 0) {
    globalState.subjects = sortSubjectsByOrder([...globalState.subjects, ...toAdd]);
    notify();
    void mutateServer('bulkAddSubjects', { classLevel, items: toAdd });
  }
  return toAdd.length;
};

const deleteSubject = (id: string) => {
  globalState.subjects = globalState.subjects.filter((s) => s.id !== id);
  notify();
  void mutateServer('deleteSubject', { id });
};

const saveClassRoutine = (routineDay: ClassRoutineDay) => {
  const targetGroup = routineDay.group || 'All';
  const normalizedDay: ClassRoutineDay = { ...routineDay, group: targetGroup };
  const existsIdx = globalState.classRoutines.findIndex(
    (r) =>
      r.className === normalizedDay.className &&
      (r.group || 'All') === targetGroup &&
      r.sectionName === normalizedDay.sectionName &&
      r.shift === normalizedDay.shift &&
      r.day === normalizedDay.day
  );
  if (existsIdx >= 0) {
    globalState.classRoutines = globalState.classRoutines.map((r, i) => (i === existsIdx ? normalizedDay : r));
  } else {
    globalState.classRoutines = [...globalState.classRoutines, normalizedDay];
  }
  notify();
  void mutateServer('saveClassRoutine', { routineDay: normalizedDay });
};

const copyClassRoutineDay = (params: {
  className: string;
  group?: AcademicGroup | 'All';
  sectionName: string;
  shift: ShiftType;
  periods: ClassRoutineDay['periods'];
  targetDays: string[];
}) => {
  const targetGroup = params.group || 'All';
  const updated = [...globalState.classRoutines];
  for (const day of params.targetDays) {
    const record: ClassRoutineDay = {
      id: `cr-${params.className}-${targetGroup}-${params.sectionName}-${params.shift}-${day}`,
      className: params.className,
      group: targetGroup,
      sectionName: params.sectionName,
      shift: params.shift,
      day,
      periods: params.periods,
    };
    const idx = updated.findIndex(
      (r) =>
        r.className === params.className &&
        (r.group || 'All') === targetGroup &&
        r.sectionName === params.sectionName &&
        r.shift === params.shift &&
        r.day === day
    );
    if (idx >= 0) updated[idx] = record;
    else updated.push(record);
  }
  globalState.classRoutines = updated;
  notify();
  void mutateServer('copyClassRoutineDay', params);
};

const addAcademicEvent = (evt: Omit<AcademicEvent, 'id'>) => {
  const created: AcademicEvent = { ...evt, id: `evt-${uidSuffix()}` };
  globalState.events = [...globalState.events, created];
  notify();
  void mutateServer('addAcademicEvent', { event: created });
  return created;
};

const updateAcademicEvent = (id: string, updates: Partial<AcademicEvent>) => {
  globalState.events = globalState.events.map((e) => (e.id === id ? { ...e, ...updates } : e));
  notify();
  void mutateServer('updateAcademicEvent', { id, updates });
};

const deleteAcademicEvent = (id: string) => {
  globalState.events = globalState.events.filter((e) => e.id !== id);
  notify();
  void mutateServer('deleteAcademicEvent', { id });
};

const addAdmissionApplication = (
  data: Omit<AdmissionApplication, 'id' | 'applicationCode' | 'applicantInitials' | 'appliedTime' | 'status'>
) => {
  const parts = data.applicantName.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'NA';
  const newApp: AdmissionApplication = {
    ...data,
    id: `app-${Date.now()}`,
    applicationCode: `APP-${8901 + globalState.admissions.length}`,
    applicantInitials: initials,
    appliedTime: 'Just now',
    status: 'Pending',
  };
  globalState.admissions = [newApp, ...globalState.admissions];
  notify();
  void mutateServer('addAdmissionApplication', data as Record<string, unknown>);
  return newApp;
};

const bulkImportAdmissions = (
  items: Array<Omit<AdmissionApplication, 'id' | 'applicationCode' | 'applicantInitials' | 'appliedTime' | 'status'>>
) => {
  const baseNum = 8901 + globalState.admissions.length;
  const created: AdmissionApplication[] = items.map((data, idx) => {
    const parts = data.applicantName.trim().split(/\s+/);
    const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'NA';
    return {
      ...data,
      id: `app-${Date.now()}-${idx}`,
      applicationCode: `APP-${baseNum + idx}`,
      applicantInitials: initials,
      appliedTime: 'CSV Import',
      status: 'Under Review',
    };
  });
  globalState.admissions = [...created, ...globalState.admissions];
  notify();
  void mutateServer('bulkImportAdmissions', { items });
  return created.length;
};

const updateAdmissionApplication = (id: string, updates: Partial<AdmissionApplication>) => {
  globalState.admissions = globalState.admissions.map((a) => (a.id === id ? { ...a, ...updates } : a));
  notify();
  void mutateServer('updateAdmissionApplication', { id, updates });
};

const updateAdmissionStatus = (id: string, status: 'Approved' | 'Under Review' | 'Pending' | 'Admitted') => {
  globalState.admissions = globalState.admissions.map((a) => (a.id === id ? { ...a, status } : a));
  notify();
  void mutateServer('updateAdmissionStatus', { id, status });
};

const deleteAdmissionApplication = (id: string) => {
  globalState.admissions = globalState.admissions.filter((a) => a.id !== id);
  notify();
  void mutateServer('deleteAdmissionApplication', { id });
};

const addStudent = (
  studentData: Omit<Student, 'id' | 'systemId'> & { systemId?: string }
) => {
  const classExisting = globalState.students.filter(
    (s) => s.className === studentData.className && s.sectionName === studentData.sectionName
  );
  const maxClassRoll = classExisting.reduce((m, s) => Math.max(m, s.rollNumber), 0);
  const manualSysId =
    typeof studentData.systemId === 'string'
      ? studentData.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
      : '';
  const newStudent: Student = {
    ...studentData,
    password: '',
    id: `stu-${uidSuffix()}`,
    systemId: manualSysId || getNextStudentSystemId(),
    rollNumber: studentData.rollNumber || maxClassRoll + 1,
  };
  globalState.students = [...globalState.students, newStudent];
  notify();
  void mutateServer('addStudent', {
    student: { ...studentData, id: newStudent.id, systemId: manualSysId || undefined },
  });
  return newStudent;
};

const addStudentAsync = async (
  studentData: Omit<Student, 'id' | 'systemId'> & { systemId?: string }
): Promise<{ ok: boolean; student?: Student; error?: string }> => {
  const manualSysId =
    typeof studentData.systemId === 'string'
      ? studentData.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
      : '';
  const clientId = `stu-${uidSuffix()}`;
  const res = await mutateServer('addStudent', {
    student: { ...studentData, id: clientId, systemId: manualSysId || undefined },
  });
  if (!res.ok || !res.data) {
    return { ok: false, error: res.error || 'Failed to enroll student.' };
  }
  const saved = res.data as Student;
  globalState.students = [
    ...globalState.students.filter((s) => s.id !== saved.id),
    saved,
  ];
  notify();
  return { ok: true, student: saved };
};

const admitApplicantToClass = (params: {
  applicationId: string;
  className: string;
  sectionName: string;
  shift: ShiftType;
  group: AcademicGroup;
  rollNumber: number;
  systemId?: string;
}) => {
  const app = globalState.admissions.find((a) => a.id === params.applicationId);
  if (!app) return null;
  const studentGender = app.gender || 'Male';
  const eligibleElectivePool = sortSubjectsByOrder(
    globalState.subjects.filter(
      (s) =>
        s.classLevel === params.className &&
        !s.isCompulsory &&
        !s.excludeFromGpa &&
        subjectAppliesToGroup(s, params.group) &&
        isStudentGenderEligibleForSubject(s, studentGender)
    )
  );
  const fourthSubjectId = eligibleElectivePool.find((s) => s.canBeFourthSubject)?.id;
  const defaultMainElective = eligibleElectivePool.find((s) => s.id !== fourthSubjectId);
  const manualSysId =
    typeof params.systemId === 'string'
      ? params.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
      : '';

  const newStu: Student = {
    id: `stu-${uidSuffix()}`,
    systemId: manualSysId || getNextStudentSystemId(),
    rollNumber: params.rollNumber,
    fullName: app.applicantName,
    gender: studentGender,
    fatherName: app.fatherName || 'Guardian On File',
    motherName: app.motherName || 'Guardian On File',
    dateOfBirth: '2010-01-01',
    className: params.className,
    sectionName: params.sectionName,
    group: params.group,
    shift: params.shift,
    religionGroup: app.religionGroup || 'Islam',
    electiveSubjectIds: defaultMainElective ? [defaultMainElective.id] : [],
    optionalFourthSubjectId: fourthSubjectId,
    status: 'Active',
    avatarUrl: '',
    phone: app.phone || '',
    address: '',
    registrationNumber: `REG-${new Date().getFullYear()}`,
  };
  globalState.students = [...globalState.students, newStu];
  globalState.admissions = globalState.admissions.map((a) =>
    a.id === params.applicationId
      ? {
          ...a,
          status: 'Admitted',
          assignedClass: params.className,
          assignedSection: params.sectionName,
          assignedRoll: params.rollNumber,
        }
      : a
  );
  notify();
  void mutateServer('admitApplicantToClass', params);
  return newStu;
};

const updateAdmissionFormConfig = (updates: Partial<AdmissionFormConfig>) => {
  globalState.admissionFormConfig = { ...globalState.admissionFormConfig, ...updates };
  notify();
  void mutateServer('updateAdmissionFormConfig', { updates });
};

const resolveClassCycle = (className: string): string => {
  const clsObj = globalState.academicClasses.find((c) => c.name === className);
  return resolveDefaultBatchCycle(className, globalState.instituteRules, clsObj);
};

const createInvoice = (params: { studentId: string; month: string; totalPayable: number }) => {
  const stu = globalState.students.find((s) => s.id === params.studentId);
  if (!stu) return null;
  const newInv: StudentInvoice = {
    id: `inv-${uidSuffix()}`,
    invoiceNo: getNextInvoiceNumber(),
    studentId: stu.id,
    studentName: stu.fullName,
    rollNumber: stu.rollNumber,
    className: stu.className,
    sectionName: stu.sectionName,
    month: params.month,
    academicYear: resolveClassCycle(stu.className),
    totalPayable: params.totalPayable,
    paidAmount: 0,
    status: 'Unpaid',
  };
  globalState.invoices = [newInv, ...globalState.invoices];
  notify();
  void mutateServer('createInvoice', params);
  return newInv;
};

const generateBulkInvoices = (className: string, month: string, amount: number) => {
  const targets = globalState.students.filter(
    (s) => s.status === 'Active' && (className === 'ALL' || s.className === className)
  );
  const created: StudentInvoice[] = [];
  for (const stu of targets) {
    if (globalState.invoices.some((i) => i.studentId === stu.id && i.month.toLowerCase() === month.toLowerCase())) {
      continue;
    }
    created.push({
      id: `inv-${uidSuffix()}-${created.length}`,
      invoiceNo: getNextInvoiceNumber(created.length),
      studentId: stu.id,
      studentName: stu.fullName,
      rollNumber: stu.rollNumber,
      className: stu.className,
      sectionName: stu.sectionName,
      month,
      academicYear: resolveClassCycle(stu.className),
      totalPayable: amount,
      paidAmount: 0,
      status: 'Unpaid',
    });
  }
  if (created.length > 0) {
    globalState.invoices = [...created, ...globalState.invoices];
    notify();
    void mutateServer('generateBulkInvoices', { className, month, amount });
  }
  return created.length;
};

const recordFeePayment = (params: {
  invoiceId?: string;
  studentId: string;
  month: string;
  amount: number;
  method: 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank';
  transactionId: string;
}): StudentInvoice | null => {
  const stu = globalState.students.find((s) => s.id === params.studentId);
  if (!stu) return null;
  const today = new Date().toISOString().split('T')[0];
  let resultInv: StudentInvoice | null = null;

  if (params.invoiceId) {
    globalState.invoices = globalState.invoices.map((inv) => {
      if (inv.id === params.invoiceId) {
        const nextPaid = Math.min(inv.totalPayable, (inv.paidAmount || 0) + params.amount);
        resultInv = {
          ...inv,
          paidAmount: nextPaid,
          status: nextPaid >= inv.totalPayable ? 'Paid' : 'Partial',
          paymentMethod: params.method,
          transactionId: params.transactionId,
          paymentDate: today,
        };
        return resultInv;
      }
      return inv;
    });
  } else {
    resultInv = {
      id: `inv-${uidSuffix()}`,
      invoiceNo: getNextInvoiceNumber(),
      studentId: stu.id,
      studentName: stu.fullName,
      rollNumber: stu.rollNumber,
      className: stu.className,
      sectionName: stu.sectionName,
      month: params.month,
      academicYear: resolveClassCycle(stu.className),
      totalPayable: params.amount,
      paidAmount: params.amount,
      status: 'Paid',
      paymentMethod: params.method,
      transactionId: params.transactionId,
      paymentDate: today,
    };
    globalState.invoices = [resultInv, ...globalState.invoices];
  }
  notify();
  void mutateServer('recordFeePayment', params);
  return resultInv;
};

const updateMfsConfig = (updates: Partial<MfsGatewayConfig>) => {
  globalState.mfsConfig = { ...globalState.mfsConfig, ...updates };
  notify();
  void mutateServer('updateMfsConfig', { updates });
};

const addTeacher = (teacher: Omit<Teacher, 'id'>) => {
  const trimmedPin =
    typeof teacher.password === 'string' && /^\d{6}$/.test(teacher.password.trim())
      ? teacher.password.trim()
      : '';
  const newTeacher: Teacher = {
    ...teacher,
    password: '',
    ...(trimmedPin ? { systemPin: trimmedPin } : {}),
    id: `t-${uidSuffix()}`,
  };
  globalState.teachers = [newTeacher, ...globalState.teachers];
  notify();
  void mutateServer('addTeacher', { teacher: { ...teacher, id: newTeacher.id } });
};

const updateTeacher = (id: string, updates: Partial<Teacher>) => {
  const hasPassUpdate = typeof updates.password === 'string' && updates.password.trim().length > 0;
  const trimmedPass = hasPassUpdate ? (updates.password as string).trim() : '';
  globalState.teachers = globalState.teachers.map((t) => {
    if (t.id !== id) return t;
    const nextTeacher: Teacher = { ...t, ...updates, password: '' };
    if (hasPassUpdate) {
      nextTeacher.systemPin = /^\d{6}$/.test(trimmedPass) ? trimmedPass : '';
    }
    return nextTeacher;
  });
  notify();
  void mutateServer('updateTeacher', { id, updates });
};

const updateOwnTeacherProfile = async (
  teacherId: string,
  updates: Partial<Teacher>
): Promise<{ ok: boolean; error?: string }> => {
  globalState.teachers = globalState.teachers.map((t) =>
    t.id === teacherId ? { ...t, ...updates, password: '' } : t
  );
  notify();
  const res = await mutateServer('updateOwnTeacherProfile', { updates });
  return res.ok ? { ok: true } : { ok: false, error: res.error || 'Could not save profile updates.' };
};

const deleteTeacher = (id: string) => {
  globalState.teachers = globalState.teachers.filter((t) => t.id !== id);
  notify();
  void mutateServer('deleteTeacher', { id });
};

const bulkAddStudents = (rows: Array<Omit<Student, 'id' | 'systemId'>>) => {
  const workingStudents = [...globalState.students];
  const academicYear =
    globalState.instituteRules.activeAcademicYear || new Date().getFullYear();
  const created: Student[] = rows.map((row, idx) => {
    const nextSysId = getNextStudentSystemIdFromStudents(
      workingStudents,
      globalState.instituteRules.studentIdPrefix,
      academicYear
    );
    const studentItem: Student = {
      ...row,
      password: '',
      id: `stu-${uidSuffix()}-${idx}`,
      systemId: nextSysId,
      rollNumber: row.rollNumber || idx + 1,
    };
    workingStudents.push(studentItem);
    return studentItem;
  });
  globalState.students = [...globalState.students, ...created];
  notify();
  void mutateServer('bulkAddStudents', { rows });
  return created.length;
};

const updateStudent = (id: string, updates: Partial<Student>) => {
  const normalizedUpdates =
    typeof updates.systemId === 'string'
      ? { ...updates, systemId: updates.systemId.replace(/[\s-]/g, '').trim().toUpperCase() }
      : updates;
  globalState.students = globalState.students.map((s) =>
    s.id === id ? { ...s, ...normalizedUpdates, password: '' } : s
  );
  notify();
  void mutateServer('updateStudent', { id, updates: normalizedUpdates });
};

const updateStudentAsync = async (
  id: string,
  updates: Partial<Student>
): Promise<{ ok: boolean; student?: Student; error?: string }> => {
  const normalizedUpdates =
    typeof updates.systemId === 'string'
      ? { ...updates, systemId: updates.systemId.replace(/[\s-]/g, '').trim().toUpperCase() }
      : updates;
  const res = await mutateServer('updateStudent', { id, updates: normalizedUpdates });
  if (!res.ok) {
    return { ok: false, error: res.error || 'Failed to update student.' };
  }
  const saved = (res.data as Student | undefined) || undefined;
  globalState.students = globalState.students.map((s) =>
    s.id === id ? (saved ? saved : { ...s, ...normalizedUpdates, password: '' }) : s
  );
  notify();
  return { ok: true, student: saved };
};

const deleteStudent = (id: string) => {
  globalState.students = globalState.students.filter((s) => s.id !== id);
  notify();
  void mutateServer('deleteStudent', { id });
};

const promoteStudents = (studentIds: string[], targetClass: string, targetSection: string) => {
  const targetClsObj = globalState.academicClasses.find((c) => c.name === targetClass);
  const nextCycle = resolveDefaultBatchCycle(targetClass, globalState.instituteRules, targetClsObj);
  let maxRoll = globalState.students
    .filter(
      (s) =>
        !studentIds.includes(s.id) &&
        s.status === 'Active' &&
        s.className === targetClass &&
        (!targetSection || s.sectionName === targetSection)
    )
    .reduce((max, s) => Math.max(max, s.rollNumber), 0);

  globalState.students = globalState.students.map((s) => {
    if (!studentIds.includes(s.id)) return s;
    maxRoll += 1;
    return {
      ...s,
      className: targetClass,
      sectionName: targetSection || s.sectionName,
      rollNumber: maxRoll,
      batchCycle: nextCycle,
      status: 'Active',
    };
  });
  notify();
  void mutateServer('promoteStudents', { studentIds, targetClass, targetSection });
};

const graduateStudents = (studentIds: string[], graduatedYear: string, graduatedWing: 'SSC' | 'HSC') => {
  globalState.students = globalState.students.map((s) =>
    studentIds.includes(s.id)
      ? {
          ...s,
          status: 'Alumni',
          graduatedYear: graduatedYear.trim() || globalState.instituteRules.activeAcademicYear || '2025',
          graduatedWing,
        }
      : s
  );
  notify();
  void mutateServer('graduateStudents', { studentIds, graduatedYear, graduatedWing });
};

const bulkUpdateStudentSubjects = (
  updates: Array<{ studentId: string; electiveSubjectIds: string[]; optionalFourthSubjectId: string }>
) => {
  const map = new Map(updates.map((u) => [u.studentId, u]));
  globalState.students = globalState.students.map((s) => {
    const upd = map.get(s.id);
    if (!upd) return s;
    const fourth = upd.optionalFourthSubjectId || '';
    return {
      ...s,
      electiveSubjectIds: upd.electiveSubjectIds.filter((id) => id !== fourth),
      optionalFourthSubjectId: fourth || undefined,
    };
  });
  notify();
  void mutateServer('bulkUpdateStudentSubjects', { updates });
};

const submitStudentUpdateRequest = (id: string, updates: Partial<Student>) => {
  globalState.students = globalState.students.map((s) =>
    s.id === id
      ? {
          ...s,
          updateRequest: updates,
          updateRequestStatus: 'Pending',
          updateRequestRejectionReason: undefined,
        }
      : s
  );
  notify();
  void mutateServer('submitStudentUpdateRequest', { id, updates });
};

const approveStudentUpdate = (id: string, selectedFields?: Array<keyof Student>) => {
  globalState.students = globalState.students.map((s) => {
    if (s.id === id && s.updateRequest) {
      const patch: Partial<Student> = {};
      if (selectedFields && selectedFields.length > 0) {
        for (const key of selectedFields) {
          if (key in s.updateRequest) {
            (patch as Record<string, unknown>)[key] = s.updateRequest[key];
          }
        }
        if ('avatarUrl' in patch && s.updateRequest.avatarPublicId) {
          patch.avatarPublicId = s.updateRequest.avatarPublicId;
        }
      } else {
        Object.assign(patch, s.updateRequest);
      }
      if (patch.presentAddress && !patch.address) {
        patch.address = patch.presentAddress;
      }
      return {
        ...s,
        ...patch,
        updateRequest: undefined,
        updateRequestStatus: 'Approved',
        updateRequestRejectionReason: undefined,
      };
    }
    return s;
  });
  notify();
  void mutateServer('approveStudentUpdate', { id, selectedFields });
};

const rejectStudentUpdate = (id: string, reason?: string) => {
  globalState.students = globalState.students.map((s) =>
    s.id === id
      ? {
          ...s,
          updateRequest: undefined,
          updateRequestStatus: 'Rejected',
          updateRequestRejectionReason: reason?.trim() || undefined,
        }
      : s
  );
  notify();
  void mutateServer('rejectStudentUpdate', { id, reason });
};

const createExam = (exam: Omit<Exam, 'id'>) => {
  const newExam: Exam = { ...exam, examinerAssignments: exam.examinerAssignments || [], id: `exam-${uidSuffix()}` };
  globalState.exams = [newExam, ...globalState.exams];
  notify();
  void mutateServer('createExam', { exam: newExam });
  return newExam;
};

const updateExam = (id: string, updates: Partial<Exam>) => {
  globalState.exams = globalState.exams.map((ex) => (ex.id === id ? { ...ex, ...updates } : ex));
  notify();
  void mutateServer('updateExam', { id, updates });
};

const deleteExam = (id: string) => {
  globalState.exams = globalState.exams.filter((ex) => ex.id !== id);
  globalState.markEntries = globalState.markEntries.filter((m) => m.examId !== id);
  notify();
  void mutateServer('deleteExam', { id });
};

const setExaminerAssignment = (params: {
  examId: string;
  className: string;
  sectionName: string;
  subjectId: string;
  teacherId: string;
  deadline?: string;
}) => {
  const sec = params.sectionName || 'Common';
  globalState.exams = globalState.exams.map((ex) => {
    if (ex.id !== params.examId) return ex;
    const current = ex.examinerAssignments || [];
    const existingIdx = current.findIndex(
      (a) => a.className === params.className && a.sectionName === sec && a.subjectId === params.subjectId
    );
    if (!params.teacherId) {
      return {
        ...ex,
        examinerAssignments: existingIdx >= 0 ? current.filter((_, i) => i !== existingIdx) : current,
      };
    }
    const nextItem: ExaminerAssignment = {
      id: existingIdx >= 0 ? current[existingIdx].id : `exm-${uidSuffix()}`,
      examId: params.examId,
      className: params.className,
      sectionName: sec,
      subjectId: params.subjectId,
      teacherId: params.teacherId,
      deadline: params.deadline,
      assignedAt: new Date().toISOString().slice(0, 10),
    };
    return {
      ...ex,
      examinerAssignments:
        existingIdx >= 0 ? current.map((a, i) => (i === existingIdx ? nextItem : a)) : [...current, nextItem],
    };
  });
  notify();
  void mutateServer('setExaminerAssignment', params);
};

const removeExaminerAssignment = (examId: string, assignmentId: string) => {
  globalState.exams = globalState.exams.map((ex) =>
    ex.id === examId
      ? {
          ...ex,
          examinerAssignments: (ex.examinerAssignments || []).filter((a) => a.id !== assignmentId),
        }
      : ex
  );
  notify();
  void mutateServer('removeExaminerAssignment', { examId, assignmentId });
};

const updateExamRoutineItem = (params: {
  examId: string;
  routineItem: ExamRoutineItem;
  previousSlot?: { className: string; sectionName?: string; subjectId: string };
  syncExaminerAssignment?: boolean;
}) => {
  globalState.exams = globalState.exams.map((ex) => {
    if (ex.id !== params.examId) return ex;
    const currentRoutine = ex.examRoutine || [];
    const existingRoutine = currentRoutine.find((r) => r.id === params.routineItem.id);
    const updatedRoutine = existingRoutine
      ? currentRoutine.map((r) => (r.id === params.routineItem.id ? params.routineItem : r))
      : [...currentRoutine, params.routineItem];

    let updatedExaminers = ex.examinerAssignments || [];
    if (params.syncExaminerAssignment !== false) {
      const prev = params.previousSlot || existingRoutine;
      if (
        prev &&
        (prev.className !== params.routineItem.className ||
          (prev.sectionName || 'Common') !== (params.routineItem.sectionName || 'Common') ||
          prev.subjectId !== params.routineItem.subjectId)
      ) {
        const prevSec = prev.sectionName || 'Common';
        updatedExaminers = updatedExaminers.filter(
          (a) =>
            !(
              a.className === prev.className &&
              a.sectionName === prevSec &&
              a.subjectId === prev.subjectId
            )
        );
      }

      if (params.routineItem.inspectorTeacherId) {
        const sec = params.routineItem.sectionName || 'Common';
        const existingExamIdx = updatedExaminers.findIndex(
          (a) =>
            a.className === params.routineItem.className &&
            a.sectionName === sec &&
            a.subjectId === params.routineItem.subjectId
        );
        const nextAssignment: ExaminerAssignment = {
          id: existingExamIdx >= 0 ? updatedExaminers[existingExamIdx].id : `exm-${uidSuffix()}`,
          examId: params.examId,
          className: params.routineItem.className,
          sectionName: sec,
          subjectId: params.routineItem.subjectId,
          teacherId: params.routineItem.inspectorTeacherId,
          deadline: params.routineItem.entryDeadline,
          assignedAt: new Date().toISOString().slice(0, 10),
        };
        updatedExaminers =
          existingExamIdx >= 0
            ? updatedExaminers.map((a, i) => (i === existingExamIdx ? nextAssignment : a))
            : [...updatedExaminers, nextAssignment];
      }
    }

    return {
      ...ex,
      examRoutine: updatedRoutine,
      examinerAssignments: updatedExaminers,
    };
  });
  notify();
  void mutateServer('updateExamRoutineItem', params);
};

const sendMarksToTabulation = (params: {
  examId: string;
  subjectId?: string;
  className?: string;
  sectionName?: string;
}) => {
  const now = new Date().toISOString();
  globalState.markEntries = globalState.markEntries.map((m) => {
    if (m.examId !== params.examId) return m;
    if (params.subjectId && m.subjectId !== params.subjectId) return m;
    if (params.className || params.sectionName) {
      const stu = globalState.students.find((s) => s.id === m.studentId);
      if (params.className && stu?.className !== params.className) return m;
      if (
        params.sectionName &&
        params.sectionName !== 'Common' &&
        params.sectionName !== 'ALL' &&
        stu?.sectionName !== params.sectionName
      ) {
        return m;
      }
    }
    return { ...m, isSentToTabulation: true, sentToTabulationAt: now };
  });
  notify();
  void mutateServer('sendMarksToTabulation', params);
};

const bulkSendMarksToTabulation = (params: { examId: string }) => {
  const now = new Date().toISOString();
  globalState.markEntries = globalState.markEntries.map((m) => {
    if (m.examId !== params.examId) return m;
    return { ...m, isSentToTabulation: true, sentToTabulationAt: now };
  });
  notify();
  void mutateServer('bulkSendMarksToTabulation', params);
};

const recallMarksFromTabulation = (params: {
  examId: string;
  subjectId?: string;
  className?: string;
  sectionName?: string;
}) => {
  globalState.markEntries = globalState.markEntries.map((m) => {
    if (m.examId !== params.examId) return m;
    if (params.subjectId && m.subjectId !== params.subjectId) return m;
    if (params.className || params.sectionName) {
      const stu = globalState.students.find((s) => s.id === m.studentId);
      if (params.className && stu?.className !== params.className) return m;
      if (
        params.sectionName &&
        params.sectionName !== 'Common' &&
        params.sectionName !== 'ALL' &&
        stu?.sectionName !== params.sectionName
      ) {
        return m;
      }
    }
    return { ...m, isSentToTabulation: false };
  });
  notify();
  void mutateServer('recallMarksFromTabulation', params);
};

const saveExamTabulation = (params: {
  examId: string;
  savedTabulation: SavedTabulationRecord;
}) => {
  globalState.exams = globalState.exams.map((ex) =>
    ex.id === params.examId ? { ...ex, savedTabulation: params.savedTabulation } : ex
  );
  notify();
  void mutateServer('saveExamTabulation', params);
};

const saveMarkEntries = (entries: Partial<MarkEntry>[]) => {
  const updated = [...globalState.markEntries];
  for (const item of entries) {
    if (!item.examId || !item.studentId || !item.subjectId) continue;
    const idx = updated.findIndex(
      (m) => m.examId === item.examId && m.studentId === item.studentId && m.subjectId === item.subjectId
    );
    if (idx >= 0 && updated[idx].isLocked) continue;

    const isAbsent = Boolean(item.isAbsent);
    const ctMarks = isAbsent ? 0 : (item.ctMarks ?? 0);
    const cqMarks = isAbsent ? 0 : (item.cqMarks ?? 0);
    const mcqMarks = isAbsent ? 0 : (item.mcqMarks ?? 0);
    const practicalMarks = isAbsent ? 0 : (item.practicalMarks ?? 0);
    const customMarks = isAbsent ? {} : (item.customMarks ?? {});
    const totalMarks = isAbsent
      ? 0
      : typeof item.totalMarks === 'number'
      ? item.totalMarks
      : ctMarks + cqMarks + mcqMarks + practicalMarks;

    const resolved: MarkEntry = {
      id: item.id || `m-${uidSuffix()}`,
      examId: item.examId,
      studentId: item.studentId,
      subjectId: item.subjectId,
      isAbsent,
      ctMarks,
      cqMarks,
      mcqMarks,
      practicalMarks,
      customMarks,
      totalMarks,
      gradePoint: isAbsent ? 0 : (item.gradePoint ?? 0),
      letterGrade: isAbsent ? 'F' : (item.letterGrade ?? 'F'),
      isPassed: isAbsent ? false : (item.isPassed ?? false),
      isOptionalFourth: item.isOptionalFourth ?? false,
      isLocked: item.isLocked ?? false,
      ...(idx >= 0 && updated[idx].isSentToTabulation !== undefined
        ? { isSentToTabulation: updated[idx].isSentToTabulation }
        : {}),
      ...(idx >= 0 && updated[idx].sentToTabulationAt
        ? { sentToTabulationAt: updated[idx].sentToTabulationAt }
        : {}),
    };
    if (idx >= 0) updated[idx] = { ...updated[idx], ...resolved };
    else updated.push(resolved);
  }
  globalState.markEntries = updated;
  notify();
  void mutateServer('saveMarkEntries', { entries });
};

const lockExamRoster = (examId: string, subjectId: string) => {
  globalState.markEntries = globalState.markEntries.map((m) =>
    m.examId === examId && m.subjectId === subjectId ? { ...m, isLocked: true } : m
  );
  notify();
  void mutateServer('lockExamRoster', { examId, subjectId });
};

const unlockExamRoster = (examId: string, subjectId: string) => {
  globalState.markEntries = globalState.markEntries.map((m) =>
    m.examId === examId && m.subjectId === subjectId ? { ...m, isLocked: false } : m
  );
  notify();
  void mutateServer('unlockExamRoster', { examId, subjectId });
};

const getCompiledExamResult = (studentId: string, examId: string): ExamResultRecord | null => {
  const snapshot = globalState.publishedResults.find(
    (r) => r.studentId === studentId && r.examId === examId
  );
  if (snapshot) return snapshot;

  const student = globalState.students.find((s) => s.id === studentId);
  const exam = globalState.exams.find((e) => e.id === examId);
  if (!student || !exam) return null;
  return compileStudentExamRecord(student, exam, globalState.subjects, globalState.markEntries, {
    combinePairedPapers: globalState.instituteRules.combinePairedPapersInResult ?? true,
  });
};

const updateSmsConfig = (updates: Partial<SmsGatewayConfig>) => {
  globalState.smsConfig = { ...globalState.smsConfig, ...updates };
  notify();
  void mutateServer('updateSmsConfig', { updates });
};

const sendSmsBroadcast = (recipientGroup: string, recipientCount: number, message: string) => {
  const newLog: SmsLog = {
    id: `sms-${uidSuffix()}`,
    recipientGroup,
    recipientCount,
    message,
    sentAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    status: 'Delivered',
  };
  globalState.smsLogs = [newLog, ...globalState.smsLogs];
  notify();
  void mutateServer('sendSmsBroadcast', { recipientGroup, recipientCount, message });
  return newLog;
};

const addAdminUser = (user: Omit<AdminUserAccount, 'id'>) => {
  const created: AdminUserAccount = { ...user, password: '', id: `adm-${uidSuffix()}` };
  globalState.adminUsers = [...globalState.adminUsers, created];
  notify();
  void mutateServer('addAdminUser', { user: { ...user, id: created.id } });
  return created;
};

const updateAdminUser = (id: string, updates: Partial<AdminUserAccount>) => {
  globalState.adminUsers = globalState.adminUsers.map((u) =>
    u.id === id ? { ...u, ...updates, password: '' } : u
  );
  notify();
  void mutateServer('updateAdminUser', { id, updates });
};

const deleteAdminUser = (id: string) => {
  globalState.adminUsers = globalState.adminUsers.filter((u) => u.id !== id);
  notify();
  void mutateServer('deleteAdminUser', { id });
};

const seedNctbPresets = async () => {
  const res = await mutateServer('seedNctbPresets', {});
  await refreshFromServer();
  return res;
};

const resetOperationalData = async (includeAcademicStructure = false) => {
  const res = await mutateServer('resetOperationalData', { includeAcademicStructure });
  await refreshFromServer();
  return res;
};

const login = (username: string, role: UserRole) => {
  globalState.currentUser = { username, role, isLoggedIn: true };
  notify();
};

const logout = async () => {
  globalState.currentUser = DEFAULT_UNAUTH_USER;
  globalSession = null;
  notify();
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'erp-client' },
    });
  } catch {
    // ignore network failure
  }
  await refreshFromServer();
};

export function useERPStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isHydrated = useSyncExternalStore(subscribe, getHydratedSnapshot, getHydratedServerSnapshot);
  const dbStatus = useSyncExternalStore(subscribe, getDbStatusSnapshot, getDbStatusServerSnapshot);
  const authSession = useSyncExternalStore(subscribe, getSessionSnapshot, getSessionServerSnapshot);

  useEffect(() => {
    mountedHooksCount += 1;
    if (!hasHydratedFromServer) {
      void refreshFromServer();
    }
    if (!syncTimer) {
      syncTimer = setInterval(() => {
        void checkSyncTick();
      }, 6000);
    }

    const onFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkSyncTick();
      }
    };
    window.addEventListener('focus', onFocusOrVisibility);
    document.addEventListener('visibilitychange', onFocusOrVisibility);

    return () => {
      mountedHooksCount = Math.max(0, mountedHooksCount - 1);
      window.removeEventListener('focus', onFocusOrVisibility);
      document.removeEventListener('visibilitychange', onFocusOrVisibility);
      if (mountedHooksCount === 0 && syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof document === 'undefined') return;
    const resolvedTitle =
      state.cmsConfig.siteTitle?.trim() || state.cmsConfig.schoolName?.trim();
    if (resolvedTitle) {
      document.title = resolvedTitle;
    }
    if (state.cmsConfig.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = state.cmsConfig.faviconUrl;
    }
  }, [
    isHydrated,
    state.cmsConfig.siteTitle,
    state.cmsConfig.schoolName,
    state.cmsConfig.faviconUrl,
  ]);

  return {
    state,
    isHydrated,
    dbStatus,
    authSession,
    refreshFromServer,
    clearDbError,
    seedNctbPresets,
    resetOperationalData,
    updateCMSConfig,
    updateInstituteRules,
    syncSchoolAcademicYearToClasses,
    syncCollegeSessionsToClasses,
    toggleAdmissionBadge,
    toggleResultsBadge,
    toggleEmergencyAlert,
    addNotice,
    deleteNotice,
    addAcademicClass,
    updateAcademicClass,
    deleteAcademicClass,
    addSubject,
    updateSubject,
    cloneSubjectsToClass,
    bulkAddSubjects,
    deleteSubject,
    saveClassRoutine,
    copyClassRoutineDay,
    addAcademicEvent,
    updateAcademicEvent,
    deleteAcademicEvent,
    addAdmissionApplication,
    bulkImportAdmissions,
    updateAdmissionApplication,
    updateAdmissionStatus,
    deleteAdmissionApplication,
    admitApplicantToClass,
    updateAdmissionFormConfig,
    createInvoice,
    generateBulkInvoices,
    recordFeePayment,
    updateMfsConfig,
    addTeacher,
    updateTeacher,
    updateOwnTeacherProfile,
    deleteTeacher,
    addStudent,
    addStudentAsync,
    bulkAddStudents,
    updateStudent,
    updateStudentAsync,
    deleteStudent,
    promoteStudents,
    graduateStudents,
    bulkUpdateStudentSubjects,
    submitStudentUpdateRequest,
    approveStudentUpdate,
    rejectStudentUpdate,
    createExam,
    updateExam,
    deleteExam,
    updateExamRoutineItem,
    setExaminerAssignment,
    removeExaminerAssignment,
    saveMarkEntries,
    lockExamRoster,
    unlockExamRoster,
    sendMarksToTabulation,
    bulkSendMarksToTabulation,
    recallMarksFromTabulation,
    saveExamTabulation,
    getCompiledExamResult,
    updateSmsConfig,
    sendSmsBroadcast,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser,
    login,
    logout,
  };
}
