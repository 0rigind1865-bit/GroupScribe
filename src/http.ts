import { NextRequest, NextResponse } from 'next/server';

// 反向代理（Tailscale Funnel、Nginx…）後面 req.url 的 host 是容器內部位址，
// new URL(path, req.url) 會產生連不到的絕對跳轉。改用相對 Location，讓瀏覽器
// 基於當前公開網址解析——與部署在哪、什麼代理無關。
export function redirectTo(path: string, status = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}

// 對外公開網址（OAuth redirect_uri 等必須是絕對網址的場合）。
// 從轉發標頭推導；代理不轉發 host 時以 APP_BASE_URL 覆寫。
export function publicBase(req: NextRequest): string {
  const env = process.env.APP_BASE_URL?.replace(/\/$/, '');
  if (env) return env;
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  return `${proto}://${host}`;
}

/** 登入後回跳、LIFF 深連結的目的地：只接受站內相對路徑；不合格回空字串。
 *  擋 //evil.com、/\evil.com（部分瀏覽器當成協定相對網址）與控制字元這類開放跳轉。 */
export function safeNext(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  return /^\/(?![/\\])[\w\-./?=&%~+:@,]*$/.test(s) && s.length <= 512 ? s : '';
}
