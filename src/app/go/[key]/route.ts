import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { redirectTo } from '@/http';
import { surfaces, type Surface } from '@/org/surfaces';
import { goTarget, sideOf, type Side } from '@/org/surface-groups';

// 換身分：記住這次選的（下次從 LINE 打開首頁直接進來），再導過去。
// 只接受「你真的有」的身分——key 對不上清單就回你自己的落地頁，不能拿來跳到別人的後台。
//
// 兩種用法：
//   /go/<key>                 工具選單、首頁選單：直接去那個工具
//   /go/@me?from=<key>        角色開關：去另一個角色，先找同一個工具的另一邊（打卡↔考勤…），
//   /go/@admin?from=<key>     再找該角色上次用的，最後第一個（規則見 src/org/surface-groups.ts）
const YEAR = 365 * 86_400;
const LAST: Record<Side, string> = { me: 'gs_last_me', admin: 'gs_last_admin' };

function go(s: Surface) {
  const res = redirectTo(s.href, 302);
  const opt = { path: '/', maxAge: YEAR, sameSite: 'lax' as const, httpOnly: true };
  res.cookies.set('gs_surface', s.key, opt);
  // 每次進一個工具就記下「這個角色上次用的」，角色開關的第三順位才有東西可用（審查 F31）
  res.cookies.set(LAST[sideOf(s.role)], s.key, opt);
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const { list, landing } = await surfaces();
  // 找不到就回自己的落地頁；真的什麼都沒有才去選單（只有一種身分的人去選單會落到「沒有功能」，審查 F6）
  const fallback = () => redirectTo(landing ?? '/?menu=1');

  const jar = await cookies();
  const s = goTarget(list, key, req.nextUrl.searchParams.get('from'), (side) => jar.get(LAST[side])?.value);
  return s ? go(s) : fallback();
}
