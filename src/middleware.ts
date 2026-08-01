import { NextRequest, NextResponse } from 'next/server';

// Dashboard 登入保護；webhook、登入、LIFF、cron 路由除外。
// cookie 為「到期時間 + HMAC 簽章」（見 core/auth.ts）。middleware 跑 edge runtime，
// 只能用 Web Crypto，不能 import node:crypto，故在此重寫一份驗證。
//
// 多租戶（migration 012）後的分工：
//   gs_auth（平台擁有者密碼 session）→ 全站放行（含 /o/[org]/(admin) 管理頁）
//   gs_liff（LINE 身分）→ 只放行 /o/[org]/attend 考勤管理頁；
//     org 成員資格屬 DB 查驗，在 server component 層做（middleware 只驗簽章與效期，
//     與 /g + isGroupMember 的分層同構）
//   舊路徑（/calendar、/tasks…）→ 302 到 /o/main/...，保住既有書籤與 LIFF admin 入口
async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

let adminKey: CryptoKey | null = null;
let liffKey: CryptoKey | null = null;

async function hmacHex(key: CryptoKey, payload: string): Promise<string> {
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function timingEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0; // 定時比較，不早退
  for (let j = 0; j < a.length; j++) diff |= a.charCodeAt(j) ^ b.charCodeAt(j);
  return diff === 0;
}

// gs_auth：`exp.HMAC(exp)`，金鑰 = ADMIN_PASSWORD
async function validAdmin(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  if (!adminKey) adminKey = await importHmacKey(pw);
  const i = raw.indexOf('.');
  if (i < 0) return false;
  const exp = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false; // 過期即失效
  return timingEq(sig, await hmacHex(adminKey, exp));
}

// gs_liff：`userId.exp.HMAC(userId.exp)`，金鑰 = LINE_CHANNEL_SECRET ?? ADMIN_PASSWORD（與 core/liff.ts 一致）
async function validLiff(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  const secret = process.env.LINE_CHANNEL_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  if (!liffKey) liffKey = await importHmacKey(secret);
  const i = raw.lastIndexOf('.');
  if (i < 0) return false;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const j = payload.lastIndexOf('.');
  if (j < 0) return false;
  const exp = payload.slice(j + 1);
  if (!payload.slice(0, j) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return timingEq(sig, await hmacHex(liffKey, payload));
}

// 搬入 /o/[org] 前的管理頁路徑；302 保舊書籤（redirect 而非 rewrite：讓網址列反映新結構）。
//
// 這是**舊書籤相容層**，不是跨租戶連結的安全網——頁面內的連結一律用 oh(slug, path) 產生，
// 由 tests/routes.test.ts 把關。這裡的預設 org 只服務「平台擁有者自己的舊書籤」。
const LEGACY = new Set(['/', '/inbox', '/calendar', '/tasks', '/notes', '/files', '/groups', '/import', '/settings', '/more']);
const DEFAULT_ORG = process.env.DEFAULT_ORG_SLUG ?? 'main';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // LIFF 深連結相容：LIFF app 的 Endpoint URL 若設在 /g（GroupScribe 成員版原本的位置），
  // https://liff.line.me/<id>/a/... 會被導到 /g/a/... 這條死路。
  // 一條 rewrite 讓 endpoint 設在根或 /g 都能開員工端，省去改 LINE Developers 設定。
  if (pathname.startsWith('/g/a/') || pathname === '/g/a') {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(2); // '/g/a/join' → '/a/join'
    return NextResponse.rewrite(url);
  }

  if (LEGACY.has(pathname)) {
    const dest = `/o/${DEFAULT_ORG}${pathname === '/' ? '' : pathname}${search}`;
    // middleware 的 redirect 必須是絕對網址（Next edge 會 new URL() 驗證）。
    // 反向代理後 req.url 是容器內部 host，改用轉發標頭組公開網址（同 http.ts publicBase）。
    const proto = req.headers.get('x-forwarded-proto') ?? 'http';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
    return NextResponse.redirect(`${proto}://${host}${dest}`, 302);
  }

  if (await validAdmin(req.cookies.get('gs_auth')?.value)) return NextResponse.next();

  // 考勤管理頁：LINE 身分（org 成員資格由 /o/[org]/attend/layout.tsx 查 org_members 決定）
  if (/^\/o\/[^/]+\/attend(\/|$)/.test(pathname) && (await validLiff(req.cookies.get('gs_liff')?.value))) {
    return NextResponse.next();
  }

  // rewrite（非 redirect）：內部改寫顯示登入頁、瀏覽器 URL 不變，
  // 避開反向代理後 req.url 是容器內部 host、又不能用相對 URL 的雙重限制。
  return NextResponse.rewrite(new URL('/login', req.url));
}

export const config = {
  // /g 與 /api/liff 為 LIFF 成員入口、/a 與 /api/attend 為考勤員工入口：
  // 不走 admin cookie，改由 LINE ID token 驗證（見 core/liff.ts；考勤 API 自帶三重把關）
  // /api/auth 為 LINE Login 流程（登入本身不能要求已登入）
  // /api/digest 給 NAS cron 打，自行以 ?key=ADMIN_PASSWORD 把關
  // g/(?!a/|a$)：/g 成員版整段跳過，但 /g/a...（LIFF endpoint 設在 /g 時的員工端深連結）
  // 要進來走上面的 rewrite。群組 id 以 a 開頭的 /g/abc 仍會被排除（負向前瞻只認 a/ 與 a 結尾）。
  matcher: ['/((?!api/webhook|api/login|api/liff|api/digest|api/attend|api/auth|login|g/(?!a/|a$)|g$|a/|a$|_next|favicon.ico).*)'],
};
