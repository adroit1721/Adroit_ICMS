import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  encryptAdminPin,
  getSessionFromRequest,
  hashPassword,
  isAdminSession,
  sanitizeMongoInput,
} from '@/lib/server/security';
import {
  StoredStudent,
  ensureSettingsDoc,
} from '@/lib/server/erp-repository';
import {
  DEFAULT_STUDENT_SCHEMA_CONFIG,
  STUDENT_SCHEMA_FIELDS,
  extractStudentIdSequence,
  formatStudentSystemId,
  generateSixDigitPin,
  getEffectiveStudentSchema,
  getFieldRequirement,
  isValidBdBirthReg,
  isValidBdMobile,
  isValidBdNid,
  normalizeBdMobileInput,
  parseDDMMYYYYToISO,
} from '@/lib/student-schema';
import {
  AcademicClass,
  AcademicGroup,
  GenderType,
  InstituteRules,
  ReligionGroup,
  ShiftType,
  Student,
  StudentCoreFieldKey,
} from '@/lib/types';
import { DEFAULT_INSTITUTE_RULES } from '@/lib/defaults';
import { resolveDefaultBatchCycle, resolveFourthSubjectId, getEligibleMainElectivePool } from '@/lib/academic-helpers';

export interface BulkImportCellError {
  row: number; // 1-indexed data row
  column: string; // Header name or field label
  value: string; // Actual value provided
  reason: string; // Failure explanation
}

export interface BulkImportCredential {
  studentId: string;
  name: string;
  className: string;
  sectionName: string;
  roll: number;
  plainPin: string;
}

function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const clean = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && clean[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

const HEADER_KEY_ALIASES: Record<string, StudentCoreFieldKey> = {
  // Academic
  'class': 'className',
  'select class': 'className',
  'classname': 'className',
  'group': 'group',
  'academic group': 'group',
  'section': 'sectionName',
  'sectionname': 'sectionName',
  'shift': 'shift',
  'roll': 'rollNumber',
  'class roll': 'rollNumber',
  'rollnumber': 'rollNumber',
  'board reg no': 'registrationNumber',
  'board reg': 'registrationNumber',
  'board registration no': 'registrationNumber',
  'registration number': 'registrationNumber',
  'registrationnumber': 'registrationNumber',
  'student id': 'systemId',
  'studentid': 'systemId',
  'systemid': 'systemId',
  'password pin': 'password',
  'password': 'password',
  '6-digit password': 'password',
  'pin': 'password',
  'primary mobile': 'phone',
  'mobile': 'phone',
  'phone': 'phone',
  'primary phone': 'phone',

  // Personal
  'name (english)': 'fullName',
  'student name (english)': 'fullName',
  'name': 'fullName',
  'fullname': 'fullName',
  'student name': 'fullName',
  'name (bangla)': 'banglaName',
  'student name (bangla)': 'banglaName',
  'banglaname': 'banglaName',
  'bangla name': 'banglaName',
  'gender': 'gender',
  'religion': 'religionGroup',
  'religiongroup': 'religionGroup',
  'date of birth': 'dateOfBirth',
  'date of birth (dd/mm/yyyy)': 'dateOfBirth',
  'dob': 'dateOfBirth',
  'dateofbirth': 'dateOfBirth',
  'birth reg no': 'birthRegOrNid',
  'birth reg no (17 digit)': 'birthRegOrNid',
  'birth registration no': 'birthRegOrNid',
  'birthregornid': 'birthRegOrNid',
  'blood group': 'bloodGroup',
  'bloodgroup': 'bloodGroup',
  'avatar url': 'avatarUrl',
  'photo': 'avatarUrl',
  'avatar': 'avatarUrl',

  // Parents & Guardian
  'father name (english)': 'fatherName',
  'father name': 'fatherName',
  'fathername': 'fatherName',
  'father name (bangla)': 'fatherBanglaName',
  'fatherbanglaname': 'fatherBanglaName',
  'father nid': 'fatherNid',
  'father nid no': 'fatherNid',
  'fathernid': 'fatherNid',
  'father mobile': 'fatherPhone',
  'father phone': 'fatherPhone',
  'fatherphone': 'fatherPhone',
  'father profession': 'fatherOccupation',
  'father occupation': 'fatherOccupation',
  'mother name (english)': 'motherName',
  'mother name': 'motherName',
  'mothername': 'motherName',
  'mother name (bangla)': 'motherBanglaName',
  'motherbanglaname': 'motherBanglaName',
  'mother nid': 'motherNid',
  'mother nid no': 'motherNid',
  'mothernid': 'motherNid',
  'mother mobile': 'motherPhone',
  'mother phone': 'motherPhone',
  'motherphone': 'motherPhone',
  'mother profession': 'motherOccupation',
  'mother occupation': 'motherOccupation',
  'local guardian': 'guardianInfo',
  'guardian info': 'guardianInfo',
  'guardian': 'guardianInfo',

  // Address
  'present address': 'presentAddress',
  'address': 'presentAddress',
  'permanent address': 'permanentAddress',
};

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const session = getSessionFromRequest(req);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      action?: 'validate' | 'commit';
      csvText?: string;
      commitValidOnly?: boolean;
    };

    const action = body.action === 'commit' ? 'commit' : 'validate';
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    const commitValidOnly = Boolean(body.commitValidOnly);

    if (!csvText.trim()) {
      return NextResponse.json({ error: 'No CSV content provided for import.' }, { status: 400 });
    }

    const parsedRows = parseCsv(csvText);
    if (parsedRows.length < 2) {
      return NextResponse.json(
        { error: 'CSV must contain at least one header row and one student data row.' },
        { status: 400 }
      );
    }

    const headerRow = parsedRows[0];
    const dataRows = parsedRows.slice(1);

    // Rule 1: Map headers ignoring '*'
    const colIndexToKey = new Map<number, StudentCoreFieldKey>();
    const colIndexToHeader = new Map<number, string>();

    headerRow.forEach((rawHeader, idx) => {
      const cleanHeader = rawHeader.replace(/\*+$/, '').trim().toLowerCase();
      colIndexToHeader.set(idx, rawHeader.trim());
      const mappedKey = HEADER_KEY_ALIASES[cleanHeader];
      if (mappedKey) {
        colIndexToKey.set(idx, mappedKey);
      }
    });

    const db = await getDb();
    const settings = await ensureSettingsDoc(db);
    const rules: InstituteRules = settings.instituteRules || DEFAULT_INSTITUTE_RULES;
    const schema = getEffectiveStudentSchema(rules);

    const academicClasses = await db
      .collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES)
      .find({})
      .sort({ order: 1, name: 1 })
      .toArray();

    const existingStudents = await db
      .collection<StoredStudent>(COLLECTIONS.STUDENTS)
      .find(
        {},
        {
          projection: {
            id: 1,
            systemId: 1,
            rollNumber: 1,
            className: 1,
            sectionName: 1,
            group: 1,
            shift: 1,
            batchCycle: 1,
            status: 1,
          },
        }
      )
      .toArray();

    const existingSystemIds = new Set<string>();
    const existingCohortRolls = new Set<string>();

    existingStudents.forEach((s) => {
      if (s.systemId) {
        existingSystemIds.add(s.systemId.replace(/[\s-]/g, '').trim().toUpperCase());
      }
      if (s.status !== 'Alumni' && s.status !== 'Graduated') {
        const cycleKey = (s.batchCycle || '').trim().toLowerCase();
        const cohortKey = `${s.className.trim().toLowerCase()}::${(s.sectionName || '').trim().toLowerCase()}::${s.rollNumber}::${cycleKey}`;
        existingCohortRolls.add(cohortKey);
      }
    });

    const prefix = (rules.studentIdPrefix || 'AG').replace(/[\s-]/g, '').trim().toUpperCase() || 'AG';
    const currentYear = rules.activeAcademicYear || new Date().getFullYear();

    // Track in-batch duplicates
    const batchSystemIds = new Set<string>();
    const batchCohortRolls = new Set<string>();

    const allErrors: BulkImportCellError[] = [];
    const validRows: Array<{
      dataRowIndex: number;
      student: Partial<Student>;
      plainPin?: string;
    }> = [];

    const previewList: Array<{
      row: number;
      isValid: boolean;
      data: Record<string, string>;
      errors: BulkImportCellError[];
    }> = [];

    dataRows.forEach((cols, rIdx) => {
      const rowNum = rIdx + 1; // 1-indexed data row
      const rowErrors: BulkImportCellError[] = [];
      const rowDataMap: Record<string, string> = {};

      colIndexToKey.forEach((key, colIdx) => {
        rowDataMap[key] = (cols[colIdx] || '').trim();
      });

      // 1. Mandatory Schema Checks (Rule 2)
      for (const meta of STUDENT_SCHEMA_FIELDS) {
        let req = getFieldRequirement(schema, meta.key);
        if (rules.studentFieldConfig?.fields) {
          const cfg = rules.studentFieldConfig.fields.find((f) => f.key === meta.key);
          if (cfg) req = cfg.visibility;
        }

        if (req === 'required') {
          const val = rowDataMap[meta.key] || '';
          if (!val) {
            rowErrors.push({
              row: rowNum,
              column: `${meta.csvHeader}*`,
              value: '',
              reason: `${meta.label} is marked mandatory (*) in school schema`,
            });
          }
        }
      }

      // 2. Academic Validation
      const rawCls = rowDataMap['className'] || '';
      const matchedCls = academicClasses.find(
        (c) => c.name.toLowerCase() === rawCls.toLowerCase()
      );

      if (!matchedCls) {
        rowErrors.push({
          row: rowNum,
          column: 'Class',
          value: rawCls,
          reason: `Class "${rawCls}" does not exist in academic structure. Available: ${academicClasses.map((c) => c.name).join(', ')}`,
        });
      }

      const activeClsName = matchedCls ? matchedCls.name : rawCls;

      // Group validation
      let assignedGroup: AcademicGroup = (rowDataMap['group'] as AcademicGroup) || 'General';
      if (matchedCls) {
        if (matchedCls.hasGroups) {
          if (!rowDataMap['group']) {
            rowErrors.push({
              row: rowNum,
              column: 'Group',
              value: '',
              reason: `Class "${matchedCls.name}" requires an Academic Group (${matchedCls.groups.join(', ')})`,
            });
          } else if (
            (matchedCls.name.includes('9') ||
              matchedCls.name.includes('10') ||
              matchedCls.name.includes('11') ||
              matchedCls.name.includes('12')) &&
            assignedGroup === 'General'
          ) {
            rowErrors.push({
              row: rowNum,
              column: 'Group',
              value: assignedGroup,
              reason: `Class "${matchedCls.name}" cannot use 'General' group under NCTB standards. Choose Science, Humanities, or Business Studies.`,
            });
          } else if (!matchedCls.groups.includes(assignedGroup)) {
            rowErrors.push({
              row: rowNum,
              column: 'Group',
              value: assignedGroup,
              reason: `Invalid group for "${matchedCls.name}". Allowed: ${matchedCls.groups.join(', ')}`,
            });
          }
        } else {
          assignedGroup = 'General';
        }
      }

      // Section validation
      let assignedSection = rowDataMap['sectionName'] || '';
      if (matchedCls) {
        if (matchedCls.hasSections) {
          if (!assignedSection) {
            rowErrors.push({
              row: rowNum,
              column: 'Section',
              value: '',
              reason: `Class "${matchedCls.name}" requires a Section (${matchedCls.sections.join(', ')})`,
            });
          } else if (!matchedCls.sections.includes(assignedSection)) {
            rowErrors.push({
              row: rowNum,
              column: 'Section',
              value: assignedSection,
              reason: `Section "${assignedSection}" does not exist in "${matchedCls.name}". Available: ${matchedCls.sections.join(', ')}`,
            });
          }
        } else {
          assignedSection = 'Common';
        }
      }

      // Shift validation
      const rawShift = (rowDataMap['shift'] || '').trim();
      let assignedShift: ShiftType = 'Morning';
      if (rawShift.toLowerCase() === 'day') assignedShift = 'Day';
      else if (rawShift.toLowerCase() === 'morning') assignedShift = 'Morning';
      else if (matchedCls && matchedCls.shifts.length === 1) {
        assignedShift = matchedCls.shifts[0];
      }

      // Roll Number Validation & Duplication
      const rollRaw = rowDataMap['rollNumber'] || '';
      const rollNum = parseInt(rollRaw, 10);
      if (!rollRaw || isNaN(rollNum) || rollNum < 1) {
        rowErrors.push({
          row: rowNum,
          column: 'Roll',
          value: rollRaw,
          reason: 'Class Roll must be a positive number (1, 2, 3...)',
        });
      } else if (matchedCls) {
        const batchCycle = resolveDefaultBatchCycle(matchedCls.name, rules, matchedCls);
        const cohortKey = `${matchedCls.name.trim().toLowerCase()}::${assignedSection.trim().toLowerCase()}::${rollNum}::${batchCycle.trim().toLowerCase()}`;

        if (batchCohortRolls.has(cohortKey)) {
          rowErrors.push({
            row: rowNum,
            column: 'Roll',
            value: String(rollNum),
            reason: `Duplicate Roll ${rollNum} in ${matchedCls.name} Section ${assignedSection} within this CSV upload`,
          });
        } else if (existingCohortRolls.has(cohortKey)) {
          rowErrors.push({
            row: rowNum,
            column: 'Roll',
            value: String(rollNum),
            reason: `Roll ${rollNum} already assigned to an existing active student in ${matchedCls.name} Section ${assignedSection}`,
          });
        }
        batchCohortRolls.add(cohortKey);
      }

      // Student ID Uniqueness (if manually provided, normalize without hyphens/spaces)
      const rawSystemId = (rowDataMap['systemId'] || '').replace(/[\s-]/g, '').trim().toUpperCase();
      if (rawSystemId) {
        if (batchSystemIds.has(rawSystemId)) {
          rowErrors.push({
            row: rowNum,
            column: 'Student ID',
            value: rawSystemId,
            reason: `Duplicate Student ID "${rawSystemId}" within this CSV file`,
          });
        } else if (existingSystemIds.has(rawSystemId)) {
          rowErrors.push({
            row: rowNum,
            column: 'Student ID',
            value: rawSystemId,
            reason: `Student ID "${rawSystemId}" already belongs to an existing student in database`,
          });
        }
        batchSystemIds.add(rawSystemId);
      }

      // Primary Mobile Validation
      const rawMobile = rowDataMap['phone'] || '';
      if (rawMobile) {
        if (!isValidBdMobile(rawMobile)) {
          rowErrors.push({
            row: rowNum,
            column: 'Primary Mobile',
            value: rawMobile,
            reason: 'Must be an 11-digit Bangladeshi mobile number starting with 013-019 (e.g. 01712345678)',
          });
        }
      }

      // Father Mobile Validation (if provided)
      const rawFatherMobile = rowDataMap['fatherPhone'] || '';
      if (rawFatherMobile && !isValidBdMobile(rawFatherMobile)) {
        rowErrors.push({
          row: rowNum,
          column: 'Father Mobile',
          value: rawFatherMobile,
          reason: 'Invalid Bangladeshi mobile format for Father Mobile',
        });
      }

      // Mother Mobile Validation (if provided)
      const rawMotherMobile = rowDataMap['motherPhone'] || '';
      if (rawMotherMobile && !isValidBdMobile(rawMotherMobile)) {
        rowErrors.push({
          row: rowNum,
          column: 'Mother Mobile',
          value: rawMotherMobile,
          reason: 'Invalid Bangladeshi mobile format for Mother Mobile',
        });
      }

      // Date of Birth Validation (DD/MM/YYYY)
      const rawDob = rowDataMap['dateOfBirth'] || '';
      let parsedIsoDob = '';
      if (rawDob) {
        parsedIsoDob = parseDDMMYYYYToISO(rawDob) || '';
        if (!parsedIsoDob) {
          // Check if already in ISO YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDob) && !isNaN(Date.parse(rawDob))) {
            parsedIsoDob = rawDob;
          } else {
            rowErrors.push({
              row: rowNum,
              column: 'Date of Birth',
              value: rawDob,
              reason: 'Date of Birth must be in DD/MM/YYYY format with valid calendar date (e.g. 15/03/2010)',
            });
          }
        }
      }

      // Birth Registration Validation (17 digits)
      const rawBirthReg = rowDataMap['birthRegOrNid'] || '';
      if (rawBirthReg && !isValidBdBirthReg(rawBirthReg)) {
        rowErrors.push({
          row: rowNum,
          column: 'Birth Reg No',
          value: rawBirthReg,
          reason: 'Bangladeshi digital birth certificate number must be exactly 17 digits',
        });
      }

      // NID Validations (10, 13, 17 digits)
      const rawFatherNid = rowDataMap['fatherNid'] || '';
      if (rawFatherNid && !isValidBdNid(rawFatherNid)) {
        rowErrors.push({
          row: rowNum,
          column: 'Father NID',
          value: rawFatherNid,
          reason: 'Bangladeshi NID must be 10, 13, or 17 digits',
        });
      }

      const rawMotherNid = rowDataMap['motherNid'] || '';
      if (rawMotherNid && !isValidBdNid(rawMotherNid)) {
        rowErrors.push({
          row: rowNum,
          column: 'Mother NID',
          value: rawMotherNid,
          reason: 'Bangladeshi NID must be 10, 13, or 17 digits',
        });
      }

      allErrors.push(...rowErrors);

      const isValidRow = rowErrors.length === 0;

      previewList.push({
        row: rowNum,
        isValid: isValidRow,
        data: rowDataMap,
        errors: rowErrors,
      });

      if (isValidRow) {
        const rawGender = (rowDataMap['gender'] || 'Male').toLowerCase();
        const gender: GenderType = rawGender === 'female' ? 'Female' : 'Male';
        const fourthId = resolveFourthSubjectId(activeClsName, assignedGroup, gender);
        const defaultElectives = getEligibleMainElectivePool(activeClsName, assignedGroup, gender)
          .filter((s) => s.id !== fourthId)
          .map((s) => s.id);

        validRows.push({
          dataRowIndex: rowNum,
          plainPin:
            rowDataMap['password'] && /^\d{6}$/.test(rowDataMap['password'].trim())
              ? rowDataMap['password'].trim()
              : generateSixDigitPin(),
          student: {
            rollNumber: rollNum,
            fullName: rowDataMap['fullName'] || `Student ${rowNum}`,
            banglaName: rowDataMap['banglaName'] || undefined,
            gender,
            religionGroup: (rowDataMap['religionGroup'] as ReligionGroup) || 'Islam',
            dateOfBirth: parsedIsoDob || '2009-01-01',
            bloodGroup: rowDataMap['bloodGroup'] || undefined,
            birthRegOrNid: rawBirthReg || undefined,
            className: activeClsName,
            sectionName: assignedSection,
            group: assignedGroup,
            shift: assignedShift,
            registrationNumber:
              rowDataMap['registrationNumber'] ||
              `211082${Math.floor(1000 + Math.random() * 8999)}`,
            systemId: rawSystemId || undefined,
            phone: normalizeBdMobileInput(rawMobile) || '01700000000',
            fatherName: rowDataMap['fatherName'] || 'Guardian on File',
            fatherBanglaName: rowDataMap['fatherBanglaName'] || undefined,
            fatherPhone: rowDataMap['fatherPhone'] || undefined,
            fatherNid: rawFatherNid || undefined,
            fatherOccupation: rowDataMap['fatherOccupation'] || undefined,
            motherName: rowDataMap['motherName'] || 'Guardian on File',
            motherBanglaName: rowDataMap['motherBanglaName'] || undefined,
            motherPhone: rowDataMap['motherPhone'] || undefined,
            motherNid: rawMotherNid || undefined,
            motherOccupation: rowDataMap['motherOccupation'] || undefined,
            guardianName: rowDataMap['guardianInfo'] || undefined,
            presentAddress: rowDataMap['presentAddress'] || 'Campus Catchment',
            permanentAddress: rowDataMap['permanentAddress'] || undefined,
            address: rowDataMap['presentAddress'] || 'Campus Catchment',
            avatarUrl: rowDataMap['avatarUrl'] || '',
            status: 'Active',
            batchCycle: matchedCls
              ? resolveDefaultBatchCycle(matchedCls.name, rules, matchedCls)
              : undefined,
            electiveSubjectIds: defaultElectives,
            optionalFourthSubjectId: fourthId,
          },
        });
      }
    });

    // Handle Dry-Run Validation Action (Rule 3)
    if (action === 'validate') {
      return NextResponse.json({
        ok: true,
        action: 'validate',
        totalRows: dataRows.length,
        validRowsCount: validRows.length,
        errorCount: allErrors.length,
        errors: allErrors,
        preview: previewList,
      });
    }

    // Handle Commit Action (Rule 4)
    if (action === 'commit') {
      if (allErrors.length > 0 && !commitValidOnly) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Validation errors found. Fix errors or choose to commit valid rows only.',
            errors: allErrors,
            totalRows: dataRows.length,
            validRowsCount: validRows.length,
            errorCount: allErrors.length,
          },
          { status: 400 }
        );
      }

      if (validRows.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'No valid rows available to commit.' },
          { status: 400 }
        );
      }

      // Calculate sequential starting number for system IDs
      let seqNum = 1;
      existingStudents.forEach((s) => {
        const num = extractStudentIdSequence(s.systemId, prefix, currentYear);
        if (num >= seqNum) {
          seqNum = num + 1;
        }
      });

      const studentsToInsert: StoredStudent[] = [];
      const credentials: BulkImportCredential[] = [];
      const nowIso = new Date().toISOString();

      validRows.forEach((item) => {
        const stuData = item.student;
        let finalSystemId = stuData.systemId?.replace(/[\s-]/g, '').trim().toUpperCase();

        if (!finalSystemId) {
          do {
            finalSystemId = formatStudentSystemId(prefix, currentYear, seqNum++);
          } while (existingSystemIds.has(finalSystemId.replace(/[\s-]/g, '').toUpperCase()));
          existingSystemIds.add(finalSystemId.replace(/[\s-]/g, '').toUpperCase());
        } else {
          existingSystemIds.add(finalSystemId);
        }

        const plainPin = item.plainPin || generateSixDigitPin();
        const passwordHash = hashPassword(plainPin);
        const studentId = `stu-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

        const newDoc: StoredStudent = {
          id: studentId,
          systemId: finalSystemId,
          rollNumber: stuData.rollNumber || 1,
          fullName: stuData.fullName || 'Student',
          banglaName: stuData.banglaName,
          gender: stuData.gender || 'Male',
          religionGroup: stuData.religionGroup || 'Islam',
          dateOfBirth: stuData.dateOfBirth || '2009-01-01',
          bloodGroup: stuData.bloodGroup,
          birthRegOrNid: stuData.birthRegOrNid,
          className: stuData.className || 'Class 9',
          sectionName: stuData.sectionName || 'A',
          group: stuData.group || 'Science',
          shift: stuData.shift || 'Morning',
          registrationNumber: stuData.registrationNumber || `21108234${seqNum}`,
          phone: stuData.phone || '01700000000',
          fatherName: stuData.fatherName || 'Father',
          fatherBanglaName: stuData.fatherBanglaName,
          fatherPhone: stuData.fatherPhone,
          fatherNid: stuData.fatherNid,
          fatherOccupation: stuData.fatherOccupation,
          motherName: stuData.motherName || 'Mother',
          motherBanglaName: stuData.motherBanglaName,
          motherPhone: stuData.motherPhone,
          motherNid: stuData.motherNid,
          motherOccupation: stuData.motherOccupation,
          guardianName: stuData.guardianName,
          presentAddress: stuData.presentAddress,
          permanentAddress: stuData.permanentAddress,
          address: stuData.address || 'Campus Catchment',
          avatarUrl: stuData.avatarUrl || '',
          status: 'Active',
          batchCycle: stuData.batchCycle,
          electiveSubjectIds: stuData.electiveSubjectIds || [],
          optionalFourthSubjectId: stuData.optionalFourthSubjectId,
          password: '', // Plain password cleared in database
          passwordHash,
          systemPinEnc: encryptAdminPin(plainPin),
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        studentsToInsert.push(newDoc);

        credentials.push({
          studentId: finalSystemId,
          name: newDoc.fullName,
          className: newDoc.className,
          sectionName: newDoc.sectionName,
          roll: newDoc.rollNumber,
          plainPin,
        });
      });

      if (studentsToInsert.length > 0) {
        await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).insertMany(studentsToInsert);
        await bumpSyncVersion(db, 'students');
      }

      return NextResponse.json({
        ok: true,
        action: 'commit',
        committedCount: studentsToInsert.length,
        skippedErrorsCount: allErrors.length,
        credentials, // Plain PIN list returned once for Credential Slip / PINs modal
      });
    }

    return NextResponse.json({ error: 'Invalid action requested.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk import execution failed.' },
      { status: 500 }
    );
  }
}
