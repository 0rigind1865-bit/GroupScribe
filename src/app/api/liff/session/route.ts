import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_TTL } from '@/core/auth';
import { adminCookieValue, isAdminLineUser, sessionCookieValue, verifyIdToken } from '@/core/liff';

// LIFF 登入：前端 liff.getIDToken() 送來 → 伺服器端向 LINE 驗證 → 簽 session cookie（7 天）。
// 若該 LINE 帳號是 ADMIN_LINE_USER_ID，一併發管理 cookie（LIFF 直接進管理版，免密碼）。
export async function POST(req: NextRequest) {
  const { idToken } = await req.json().catch(() => ({}) as { idToken?: string });
  if (typeof idToken !== 'string' || !idToken) return NextResponse.json({ error: '缺 idToken' }, { status: 400 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: 'ID token 驗證失敗' }, { status: 401 });

  const c = sessionCookieValue(user.userId);
  const admin = isAdminLineUser(user.userId);
  const res = NextResponse.json({ ok: true, admin });
  res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: 'lax', maxAge: c.maxAge, path: '/' });
  if (admin) {
    const auth = adminCookieValue();
    if (auth) res.cookies.set('gs_auth', auth, { httpOnly: true, sameSite: 'lax', maxAge: ADMIN_TTL, path: '/' });
  }
  return res;
}
