import { NextResponse } from 'next/server';

// 反向代理（Tailscale Funnel、Nginx…）後面 req.url 的 host 是容器內部位址，
// new URL(path, req.url) 會產生連不到的絕對跳轉。改用相對 Location，讓瀏覽器
// 基於當前公開網址解析——與部署在哪、什麼代理無關。
export function redirectTo(path: string, status = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
