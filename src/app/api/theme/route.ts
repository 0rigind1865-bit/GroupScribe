import { NextRequest } from 'next/server';
import { redirectTo, safeNext } from '@/http';

// 外觀切換（零 client JS，同 /api/attend/lang）：?to=light|dark|auto → 寫 theme cookie（auto＝刪掉、跟系統）後導回原頁。
// 回哪頁：帶 back 用 back，否則用 Referer 的路徑（只取路徑，永遠留在站內）
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to');
  let ref = '';
  try {
    const u = new URL(req.headers.get('referer') ?? '');
    ref = u.pathname + u.search;
  } catch {}
  const res = redirectTo(safeNext(req.nextUrl.searchParams.get('back')) || safeNext(ref) || '/');
  res.headers.append(
    'Set-Cookie',
    to === 'light' || to === 'dark' ? `theme=${to}; Path=/; Max-Age=31536000; SameSite=Lax` : 'theme=; Path=/; Max-Age=0; SameSite=Lax',
  );
  return res;
}
