import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { stripMongoDoc } from '@/lib/server/erp-repository';
import { assertTrustedOrigin, sanitizeMongoInput } from '@/lib/server/security';
import { normalizeDobToIso } from '@/lib/server/admission-billing-service';
import { normalizeBdMobileInput } from '@/lib/student-schema';
import { AdmissionApplication, StudentInvoice } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      applicationCode?: string;
      phone?: string;
      dateOfBirth?: string;
    };

    const applicationCode = String(body.applicationCode || '').trim().toUpperCase();
    const phoneInput = body.phone ? normalizeBdMobileInput(String(body.phone)) : '';
    const dobInput = normalizeDobToIso(body.dateOfBirth);

    if (!applicationCode || (!phoneInput && !dobInput)) {
      return NextResponse.json(
        { error: 'Application Code and Guardian Phone OR Date of Birth are required.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const rawApp = await db
      .collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS)
      .findOne({ applicationCode });

    if (!rawApp) {
      return NextResponse.json(
        { error: `No application found with code "${applicationCode}".` },
        { status: 404 }
      );
    }

    const app = stripMongoDoc(
      rawApp as unknown as Record<string, unknown>
    ) as unknown as AdmissionApplication;

    const appPhones = [app.phone, app.fatherPhone, app.motherPhone, app.guardianPhone]
      .filter(Boolean)
      .map((x) => normalizeBdMobileInput(String(x)));
    const appDob = normalizeDobToIso(app.dateOfBirth);

    const phoneOk = Boolean(phoneInput && appPhones.includes(phoneInput));
    const dobOk = Boolean(dobInput && appDob && appDob === dobInput);

    if (!phoneOk && !dobOk) {
      return NextResponse.json(
        { error: 'Verification failed. Phone number or Date of Birth does not match.' },
        { status: 403 }
      );
    }

    let invoice: StudentInvoice | null = null;
    const invId = app.paymentSummary?.invoiceId;
    if (invId) {
      const rawInv = await db.collection<StudentInvoice>(COLLECTIONS.INVOICES).findOne({ id: invId });
      if (rawInv) {
        invoice = stripMongoDoc(
          rawInv as unknown as Record<string, unknown>
        ) as unknown as StudentInvoice;
      }
    } else {
      const rawInv = await db
        .collection<StudentInvoice>(COLLECTIONS.INVOICES)
        .findOne({ applicationId: app.id });
      if (rawInv) {
        invoice = stripMongoDoc(
          rawInv as unknown as Record<string, unknown>
        ) as unknown as StudentInvoice;
      }
    }

    return NextResponse.json({
      ok: true,
      application: app,
      invoice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to locate admission record' },
      { status: 500 }
    );
  }
}
