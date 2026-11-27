import { InstituteRules, StaffCategory, Teacher } from './types';

export function normalizeTeacherCategory(cat?: StaffCategory | string): 'Teacher' | 'Staff' {
  if (!cat || cat === 'Teacher' || cat === 'Teaching') {
    return 'Teacher';
  }
  return 'Staff';
}

export function isTeachingStaff(t: Pick<Teacher, 'staffCategory'>): boolean {
  return normalizeTeacherCategory(t.staffCategory) === 'Teacher';
}

export function cleanTeacherIdPrefix(prefix: string | undefined, fallback: string): string {
  const cleaned = (prefix || fallback)
    .replace(/[\s-]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned || fallback;
}

export function formatTeacherOrStaffId(
  category: StaffCategory | undefined,
  rankOrder: number,
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>
): string {
  const normalized = normalizeTeacherCategory(category);
  const rank = Math.max(1, Math.floor(Number.isFinite(rankOrder) ? rankOrder : 1));
  if (normalized === 'Teacher') {
    const prefix = cleanTeacherIdPrefix(rules?.teacherIdPrefix, 'RHHSTID');
    return `${prefix}${rank}`;
  }
  const prefix = cleanTeacherIdPrefix(rules?.staffIdPrefix, 'RHHSSID');
  return `${prefix}${String(rank).padStart(3, '0')}`;
}

export function extractRankFromEmployeeId(
  employeeId: string | undefined,
  category: StaffCategory | undefined,
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>
): number {
  if (!employeeId) return 0;
  const cleanId = employeeId.replace(/[\s-]/g, '').trim().toUpperCase();
  const normalized = normalizeTeacherCategory(category);
  const prefix =
    normalized === 'Teacher'
      ? cleanTeacherIdPrefix(rules?.teacherIdPrefix, 'RHHSTID')
      : cleanTeacherIdPrefix(rules?.staffIdPrefix, 'RHHSSID');

  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = cleanId.match(new RegExp(`^${esc(prefix)}(\\d+)$`, 'i'));
  if (m) {
    const n = parseInt(m[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

export function getNextRankOrderForCategory(
  teachers: Array<Pick<Teacher, 'staffCategory' | 'rankOrder' | 'employeeId'>>,
  category: StaffCategory | undefined,
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>
): number {
  const targetCat = normalizeTeacherCategory(category);
  let maxRank = 0;
  for (const t of teachers) {
    if (normalizeTeacherCategory(t.staffCategory) !== targetCat) continue;
    const rank =
      typeof t.rankOrder === 'number' && t.rankOrder > 0
        ? t.rankOrder
        : extractRankFromEmployeeId(t.employeeId, t.staffCategory, rules);
    if (rank > maxRank) maxRank = rank;
  }
  return maxRank + 1;
}

export function getNextUniqueTeacherOrStaffId(
  teachers: Array<Pick<Teacher, 'staffCategory' | 'rankOrder' | 'employeeId'>>,
  category: StaffCategory | undefined,
  preferredRank?: number,
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>,
  excludeTeacherId?: string
): { employeeId: string; rankOrder: number } {
  const existingIds = new Set(
    teachers
      .filter((t) => !excludeTeacherId || (t as { id?: string }).id !== excludeTeacherId)
      .map((t) => (t.employeeId || '').replace(/[\s-]/g, '').trim().toUpperCase())
      .filter(Boolean)
  );

  let rank =
    typeof preferredRank === 'number' && preferredRank >= 1
      ? Math.floor(preferredRank)
      : getNextRankOrderForCategory(teachers, category, rules);

  let candidate = formatTeacherOrStaffId(category, rank, rules);
  while (existingIds.has(candidate.toUpperCase())) {
    rank += 1;
    candidate = formatTeacherOrStaffId(category, rank, rules);
  }
  return { employeeId: candidate, rankOrder: rank };
}

export function generateSixDigitPinValue(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function sortTeachersBySeniority<
  T extends Pick<Teacher, 'rankOrder' | 'staffCategory' | 'name' | 'employeeId'>
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const catA = normalizeTeacherCategory(a.staffCategory);
    const catB = normalizeTeacherCategory(b.staffCategory);
    if (catA !== catB) {
      return catA === 'Teacher' ? -1 : 1;
    }
    const rankA = typeof a.rankOrder === 'number' && a.rankOrder > 0 ? a.rankOrder : Number.MAX_SAFE_INTEGER;
    const rankB = typeof b.rankOrder === 'number' && b.rankOrder > 0 ? b.rankOrder : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return (a.name || '').localeCompare(b.name || '');
  });
}
