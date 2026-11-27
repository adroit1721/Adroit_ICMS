import { NextRequest, NextResponse } from 'next/server';
import { assertTrustedOrigin, clearSessionCookie } from '@/lib/server/security';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
