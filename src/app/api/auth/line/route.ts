import { NextRequest } from 'next/server';
import { publicBase, redirectTo } from '@/http';
import { liffId } from '@/core/liff';

// org 管理員登入（多租戶，migration 012）：LINE Login OAuth authorization code flow。
// 為什麼用 LINE 而不是信箱密碼：員工端本來就必須用 LINE（LIFF 打卡），管理員與員工
// 同一套身分系統＝一張 line_user_id 打通 org_members / employees；免建密碼表、免重設信、
// 零新依賴（bcrypt/argon2 都不必裝）。ADMIN_LINE_USER_ID 已是「LINE 帳號即後台鑰匙」的先例。
//
// client_id = LIFF ID 前段（Login channel）；redirect_uri 必須與 LINE Developers
// 註冊的 Callback URL 一致——從轉發標頭推導，APP_BASE_URL 可覆寫（代理不轉發 host 時用）。

export async function GET(req: NextRequest) {
  const channelId = liffId().split('-')[0];
  if (!channelId) return redirectTo('/login?error=noliff');

  // state：舊系統產生了卻從不驗證（CSRF 防護寫一半）；這裡發 cookie、callback 比對
  const state = crypto.randomUUID();
  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', channelId);
  url.searchParams.set('redirect_uri', `${publicBase(req)}/api/auth/line/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'openid profile');

  const res = redirectTo(url.toString(), 302);
  res.headers.append(
    'Set-Cookie',
    `gs_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
  );
  // 登入後回跳（認領頁用）：只接受站內相對路徑，擋 //evil 這種開放跳轉
  const next = req.nextUrl.searchParams.get('next') ?? '';
  if (/^\/(?!\/)[\w\-./?=&%]*$/.test(next)) {
    res.headers.append('Set-Cookie', `gs_next=${encodeURIComponent(next)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`);
  }
  return res;
}
