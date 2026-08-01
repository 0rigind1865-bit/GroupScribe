import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';

// 語言切換（零 client JS）：?to=vi&back=/a → 設 lang cookie 後導回。
const LOCALES = new Set(['zh-TW', 'en', 'ja', 'vi', 'id']);

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') ?? '';
  const backRaw = req.nextUrl.searchParams.get('back') ?? '/a';
  // 只接受站內相對路徑（防 open redirect）
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/a';
  const res = redirectTo(back);
  if (LOCALES.has(to)) {
    res.headers.append('Set-Cookie', `lang=${to}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  return res;
}
