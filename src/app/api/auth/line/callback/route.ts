import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { publicBase, redirectTo, safeNext } from '@/http';
import { adminCookieValue, isAdminLineUser, liffId, sessionCookieValue, verifyIdToken } from '@/core/liff';
import { ADMIN_TTL } from '@/core/auth';

// LINE Login callback：code 換 token → 驗 id_token → 設 gs_liff cookie →
// 依 org_members 決定落地頁。與 LIFF 的 gs_liff 完全同一套 session（core/liff.ts），
// 所以從這裡登入的管理員，之後開員工 LIFF 也是同一個身分。
//
// 需要 env LINE_LOGIN_CHANNEL_SECRET（LIFF 所屬 Login channel 的 Channel secret；
// 與 LINE_CHANNEL_SECRET 不同——那是 Messaging API channel 的）。

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expectState = req.cookies.get('gs_oauth_state')?.value;
  if (!code || !state || !expectState || state !== expectState) {
    return redirectTo('/login?error=state');
  }

  const channelId = liffId().split('-')[0];
  const secret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !secret) return redirectTo('/login?error=noliff');

  // code 換 token（https://developers.line.biz/en/reference/line-login/#issue-access-token）
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${publicBase(req)}/api/auth/line/callback`,
      client_id: channelId,
      client_secret: secret,
    }),
  });
  if (!tokenRes.ok) {
    console.warn('LINE Login token 交換失敗', tokenRes.status, await tokenRes.text());
    return redirectTo('/login?error=line');
  }
  const { id_token: idToken } = await tokenRes.json();
  const user = idToken ? await verifyIdToken(idToken) : null;
  if (!user) return redirectTo('/login?error=line');

  const db = getDb();

  // 原本這裡有「平台擁有者自動種子」（ADMIN_LINE_USER_ID 登入即成為 main 的 owner）——A6 拿掉了：
  // 等於一把後門。要加 owner 用 scripts/seed-owner.ts。平台擁有者身分（isPlatformOwner）不受影響。

  // 落地頁：第一個所屬 org 的考勤管理；無任何 org 身分＝不是管理員
  const { data: memberships } = await db
    .from('org_members')
    .select('org_id, orgs(slug)')
    .eq('line_user_id', user.userId)
    .limit(1);
  const slug = (memberships?.[0] as { orgs?: { slug?: string } } | undefined)?.orgs?.slug;

  const cookie = sessionCookieValue(user.userId);
  // 有指定回跳（認領頁）就回去；否則落到第一個 org。沒有任何 org 但有回跳頁的人（例如還沒被加成管理員）
  // 也先回去，由那一頁把「你不是任何組織的管理員」講清楚
  const nextRaw = req.cookies.get('gs_next')?.value;
  const next = nextRaw ? decodeURIComponent(nextRaw) : '';
  // 有 org 就交給 / 依模組與面向落地（src/app/page.tsx），不再寫死考勤——只開群組助理的 org 會 404
  // 沒有任何 org 的人回跳到後台頁只會 404：改說清楚「這個帳號還沒有組織」
  const back = safeNext(next) && (slug || !next.startsWith('/o/')) ? next : '';
  const res = redirectTo(back || (slug ? '/' : '/login?error=noorg'));
  res.headers.append('Set-Cookie', 'gs_next=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  res.headers.append(
    'Set-Cookie',
    `${cookie.name}=${cookie.value}; Path=/; Max-Age=${cookie.maxAge}; HttpOnly; SameSite=Lax; Secure`,
  );
  res.headers.append('Set-Cookie', 'gs_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  // 平台擁有者（ADMIN_LINE_USER_ID）：與手機 LIFF 那條路（/api/liff/session）一樣發管理 cookie。
  // 原本只有 LIFF 會發，電腦用 LINE 登入的平台擁有者只被當成 main 的 owner——別家公司 404、設定存不了。
  if (isAdminLineUser(user.userId)) {
    const auth = adminCookieValue();
    if (auth) res.headers.append('Set-Cookie', `gs_auth=${auth}; Path=/; Max-Age=${ADMIN_TTL}; HttpOnly; SameSite=Lax; Secure`);
  }
  return res;
}
