import { NextRequest, NextResponse } from 'next/server';

// Dashboard 登入保護；webhook、登入、LIFF、cron 路由除外。
// cookie 為「到期時間 + HMAC 簽章」（見 core/auth.ts）。middleware 跑 edge runtime，
// 只能用 Web Crypto，不能 import node:crypto，故在此重寫一份驗證。
let cachedKey: CryptoKey | null = null;

async function hmacKey(): Promise<CryptoKey | null> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pw),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return cachedKey;
}

async function valid(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  const key = await hmacKey();
  if (!key) return false;
  const i = raw.indexOf('.');
  if (i < 0) return false;
  const exp = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false; // 過期即失效
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(exp));
  const expect = Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  if (sig.length !== expect.length) return false;
  let diff = 0; // 定時比較，不早退
  for (let j = 0; j < sig.length; j++) diff |= sig.charCodeAt(j) ^ expect.charCodeAt(j);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  if (await valid(req.cookies.get('gs_auth')?.value)) return NextResponse.next();
  // rewrite（非 redirect）：內部改寫顯示登入頁、瀏覽器 URL 不變，
  // 避開反向代理後 req.url 是容器內部 host、又不能用相對 URL 的雙重限制。
  return NextResponse.rewrite(new URL('/login', req.url));
}

export const config = {
  // /g 與 /api/liff 為 LIFF 成員入口：不走 admin cookie，改由 LINE ID token 驗證（見 core/liff.ts）
  // /api/digest 給 NAS cron 打，自行以 ?key=ADMIN_PASSWORD 把關
  matcher: ['/((?!api/webhook|api/login|api/liff|api/digest|login|g/|g$|_next|favicon.ico).*)'],
};
