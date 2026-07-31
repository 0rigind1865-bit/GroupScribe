import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { ADMIN_TTL, adminSessionValue, clearLoginFails, loginBlocked, recordLoginFail } from '@/core/auth';

export async function POST(req: NextRequest) {
  // 反向代理後看真實來源（Tailscale Funnel 會帶 x-forwarded-for）
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (loginBlocked(ip)) return redirectTo('/login?error=locked');

  const form = await req.formData();
  const pw = form.get('password');
  const expect = process.env.ADMIN_PASSWORD;
  if (!expect || pw !== expect) {
    recordLoginFail(ip);
    return redirectTo('/login?error=1');
  }
  clearLoginFails(ip);

  const res = redirectTo('/');
  // cookie 為 HMAC 簽章＋到期時間（不再是密碼的固定雜湊）：外洩有期限、改密碼即全面失效
  res.cookies.set('gs_auth', adminSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: ADMIN_TTL,
    path: '/',
  });
  return res;
}
