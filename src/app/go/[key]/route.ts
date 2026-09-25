import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { surfaces } from '@/org/surfaces';

// 換身分：記住這次選的（下次從 LINE 打開首頁直接進來），再導過去。
// 只接受「你真的有」的身分——key 對不上清單就回選單，不能拿來跳到別人的後台。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const { list } = await surfaces();
  const s = list.find((x) => x.key === key);
  if (!s) return redirectTo('/?menu=1');
  const res = redirectTo(s.href, 302);
  res.cookies.set('gs_surface', s.key, { path: '/', maxAge: 365 * 86_400, sameSite: 'lax', httpOnly: true });
  return res;
}
