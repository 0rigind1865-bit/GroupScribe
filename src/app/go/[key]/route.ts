import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { redirectTo } from '@/http';
import { surfaces, type Surface } from '@/org/surfaces';
import { goTarget, sideOf, type Side } from '@/org/surface-groups';

// 換身分：只接受「你真的有」的身分——key 對不上清單就回你自己的落地頁，不能拿來跳到別人的後台。
//
// 用法：
//   /go/<key>?home=1          首頁選單：去那個工具，並設成「下次打開首頁直接進來」
//   /go/<key>?from=<key>      工具選單、琥珀小點：只是去那個工具（臨時切換不改首頁預設，T10 第 2 輪）
//   /go/@me?from=<key>        角色開關：去另一個角色（規則見 src/org/surface-groups.ts resolveRoleJump）
//   /go/@admin?from=<key>
const YEAR = 365 * 86_400;
const LAST: Record<Side, string> = { me: 'gs_last_me', admin: 'gs_last_admin' };
const BACK: Record<Side, string> = { me: 'gs_back_me', admin: 'gs_back_admin' };

function go(s: Surface, from: Surface | undefined, home: boolean) {
  const res = redirectTo(s.href, 302);
  const opt = { path: '/', maxAge: YEAR, sameSite: 'lax' as const, httpOnly: true };
  if (home) res.cookies.set('gs_surface', s.key, opt);
  // 每次進一個工具就記下「這個角色上次用的」，角色開關的第三順位才有東西可用（審查 F31）
  res.cookies.set(LAST[sideOf(s.role)], s.key, opt);
  // 跨角色時記「從哪一格離開、到了哪」：馬上按回去就回原處（resolveRoleJump 1.5）。
  // ponytail: 12 小時，同一個工作天內有效；過了就回到同工具對應
  if (from && sideOf(from.role) !== sideOf(s.role)) res.cookies.set(BACK[sideOf(from.role)], `${from.key}~${s.key}`, { ...opt, maxAge: 43_200 });
  // 其他跳轉（工具選單、首頁選單、平台頁）＝「換過工具了」：清掉來回紀錄，之後照同工具對應（最後審查）
  else for (const k of Object.values(BACK)) res.cookies.delete(k);
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const { list, landing } = await surfaces();
  // 找不到就回自己的落地頁；真的什麼都沒有才去選單（只有一種身分的人去選單會落到「沒有功能」，審查 F6）
  const fallback = () => redirectTo(landing ?? '/?menu=1');

  const jar = await cookies();
  const q = req.nextUrl.searchParams;
  const from = q.get('from');
  const s = goTarget(list, key, from, (side) => jar.get(LAST[side])?.value, (side) => jar.get(BACK[side])?.value);
  return s ? go(s, list.find((x) => x.key === from), q.get('home') === '1') : fallback();
}
