import { NextRequest, NextResponse } from 'next/server';
import { Db } from 'mongodb';
import { getDb } from '@/lib/server/mongodb';
import { ensureSettingsDoc, getNeedsInitialAdminSetup } from '@/lib/server/erp-repository';
import { DEFAULT_INSTITUTE_RULES } from '@/lib/defaults';
import {
  STUDENT_SCHEMA_FIELDS,
  formatStudentSystemId,
  getEffectiveStudentSchema,
  getFieldRequirement,
} from '@/lib/student-schema';
import {
  InstituteRules,
  StudentCoreFieldKey,
  StudentFieldRequirement,
} from '@/lib/types';
import { getSessionFromRequest, isAdminSession } from '@/lib/server/security';

function escapeCsvValue(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  let db: Db | null = null;
  try {
    db = await getDb();
  } catch {
    // Db may be initializing
  }

  const needsInitialSetup = db ? await getNeedsInitialAdminSetup(db).catch(() => false) : false;
  const isTrustedClient = req.headers.get('x-requested-with') === 'erp-client';

  if (!isAdminSession(session) && !needsInitialSetup && !isTrustedClient) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    let rules: InstituteRules = DEFAULT_INSTITUTE_RULES;
    if (db) {
      try {
        const settings = await ensureSettingsDoc(db);
        if (settings?.instituteRules) {
          rules = settings.instituteRules;
        }
      } catch {
        // Fallback to default institute rules
      }
    }

    const schema = getEffectiveStudentSchema(rules);

    const getFieldVisibility = (key: StudentCoreFieldKey): StudentFieldRequirement => {
      if (rules.studentFieldConfig?.fields) {
        const item = rules.studentFieldConfig.fields.find((f) => f.key === key);
        if (item) return item.visibility;
      }
      return getFieldRequirement(schema, key);
    };

    const prefix = (rules.studentIdPrefix || 'AG').trim().toUpperCase() || 'AG';
    const currentYear = rules.activeAcademicYear || new Date().getFullYear();

    const sampleValues: Record<StudentCoreFieldKey, string> = {
      // Academic
      className: 'Class 9',
      group: 'Science',
      sectionName: 'A',
      shift: 'Morning',
      rollNumber: '1',
      registrationNumber: '2110823401',
      systemId: formatStudentSystemId(prefix, currentYear, 1),
      password: '654321',
      phone: '01712345678', // Valid Bangladeshi 017XXXXXXXX

      // Personal
      fullName: 'Farhan Sadik',
      banglaName: 'ফারহান সাদিক',
      gender: 'Male',
      religionGroup: 'Islam',
      dateOfBirth: '15/03/2010', // Strictly DD/MM/YYYY
      birthRegOrNid: '20101234567890123', // Strictly 17 digits
      bloodGroup: 'B+',
      avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136',

      // Parents & Guardian
      fatherName: 'Md. Jahangir Alam',
      fatherBanglaName: 'মো: জাহাঙ্গীর আলম',
      fatherPhone: '01812345678',
      fatherNid: '19821234567890123',
      fatherOccupation: 'Government Service',
      fatherProfession: 'Government Service',
      motherName: 'Shahnaz Begum',
      motherBanglaName: 'শাহনাজ বেগম',
      motherPhone: '01912345678',
      motherNid: '19851234567890123',
      motherOccupation: 'Homemaker',
      motherProfession: 'Homemaker',
      guardianInfo: 'Md. Rafiqul Islam (Uncle, 01722334455)',
      guardianName: 'Md. Rafiqul Islam',
      guardianRelation: 'Uncle',
      guardianPhone: '01722334455',

      // Address
      presentAddress: 'House 12, Road 4, Sector 3, Uttara, Dhaka-1230',
      permanentAddress: 'Village: Rampur, Post: Chandpur-3600, Sadar, Chandpur',
    };

    const headers: string[] = [];
    const sampleRow: string[] = [];

    for (const meta of STUDENT_SCHEMA_FIELDS) {
      const visibility = getFieldVisibility(meta.key);

      // Rule 1: Exclude any field marked hidden
      if (visibility === 'hidden') {
        continue;
      }

      // Rule 2: Append * to column headers marked required; keep optional without *
      const headerText = visibility === 'required' ? `${meta.csvHeader}*` : meta.csvHeader;
      headers.push(headerText);

      // Rule 3: Sample value
      const val = sampleValues[meta.key] ?? '';
      sampleRow.push(val);
    }

    // Support any active custom fields
    if (Array.isArray(schema.customFields)) {
      for (const cf of schema.customFields) {
        if (cf.requirement !== 'hidden') {
          const isReq = cf.required || cf.requirement === 'required';
          headers.push(isReq ? `${cf.label}*` : cf.label);
          sampleRow.push(cf.type === 'number' ? '100' : 'Sample Value');
        }
      }
    }

    const headerLine = headers.map(escapeCsvValue).join(',');
    const sampleLine = sampleRow.map(escapeCsvValue).join(',');

    // Rule 4: Encode with UTF-8 BOM (\uFEFF) so Bangla text opens cleanly in Excel
    const csvContent = '\uFEFF' + `${headerLine}\r\n${sampleLine}\r\n`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="student_import_template.csv"',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate CSV template' },
      { status: 500 }
    );
  }
}
