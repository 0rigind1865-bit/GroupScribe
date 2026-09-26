import type { Surface, SurfaceId, SurfaceRole } from './surfaces';

// 身分切換（個人／管理兩層）的純邏輯：把 surfaces() 的平面清單分成兩層，
// 並回答「切到另一個角色要去哪」。不碰 DB、React、next——node:test 直接測（tests/surfaces.test.ts）。
//
// 設計定案見 docs/identity-switcher-plan.md 第 2 節：
//   第一層＝角色（個人／管理；平台擁有者的東西歸在管理那一邊）
//   第二層＝工具（群組／打卡／報帳 ↔ 群組助理／考勤／報帳），管理側依公司分段

export type Side = 'me' | 'admin';
export type AdminOrg = { slug: string; name: string; items: Surface[]; injected?: boolean };
export type Grouped = { me: Surface[]; admin: AdminOrg[]; platform: Surface[] };
/** 目前所在的管理頁（shell-header 由 URL 與 orgBySlug 得知）；個人頁傳 null */
export type Current = { slug: string; name: string; id: SurfaceId } | null;

export const sideOf = (role: SurfaceRole): Side => (role === 'me' ? 'me' : 'admin');

// 與 surfaces.ts、routes.tsx 的 module.base 同步（這裡要保持純邏輯，不 import 路由表）
const ADMIN_HREF: Partial<Record<SurfaceId, (slug: string) => string>> = {
  gs: (s) => `/o/${s}`,
  attend: (s) => `/o/${s}/attend`,
  expense: (s) => `/o/${s}/expense`,
};

export function groupSurfaces(list: Surface[], current: Current = null): Grouped {
  const me = list.filter((s) => s.role === 'me');
  const platform = list.filter((s) => s.role === 'platform');
  const admin: AdminOrg[] = [];
  for (const s of list) {
    if (s.role !== 'admin' || !s.slug) continue;
    let org = admin.find((o) => o.slug === s.slug);
    if (!org) admin.push((org = { slug: s.slug, name: s.orgName ?? s.slug, items: [] }));
    org.items.push(s);
  }
  // 安全網：站在清單外的公司、或清單裡這家沒有目前這個工具（平台擁有者從平台頁點進去時，
  // visibleModules 給全部模組、surfaces 卻依公司設定列）——補上，
  // 否則身分列會把你正在管的公司說成清單裡的另一家、或找不到目前項目（審查 F4）。
  if (current && current.slug !== 'unclaimed') {
    const href = ADMIN_HREF[current.id]?.(current.slug);
    let org = admin.find((o) => o.slug === current.slug);
    if (href && !org?.items.some((i) => i.id === current.id)) {
      if (!org) admin.push((org = { slug: current.slug, name: current.name, items: [] }));
      org.injected = true;
      org.items.push({ key: `${current.id}:${current.slug}`, id: current.id, role: 'admin', slug: current.slug, orgName: org.name, label: current.id, desc: '', href, rank: 9 });
    }
  }
  return { me, admin, platform };
}

/** 同一個角色裡的所有工具（管理側＝各公司的工具＋平台） */
export function itemsOf(g: Grouped, side: Side): Surface[] {
  return side === 'me' ? g.me : [...g.admin.flatMap((o) => o.items), ...g.platform];
}

/** 兩個角色都有東西才需要角色開關 */
export const hasRoleToggle = (g: Grouped) => g.me.length > 0 && itemsOf(g, 'admin').length > 0;

/** 管多家公司（或站在補進來的公司）時，工具按鈕要帶公司名 */
export const multiOrg = (g: Grouped) => g.admin.length > 1 || g.admin.some((o) => o.injected);

/**
 * 身分列三態（審查 F9）：
 *   a＝角色開關＋工具按鈕；b＝沒有開關、工具按鈕有 ▾；c＝一個角色一個工具。
 *   c 在管理側仍要畫深色列與「考勤 · 公司名」標題；在個人側整列不渲染（呼叫端決定）。
 */
export function barState(g: Grouped, side: Side): 'a' | 'b' | 'c' {
  if (hasRoleToggle(g)) return 'a';
  return itemsOf(g, side).length > 1 ? 'b' : 'c';
}

// 同一個工具在另一個角色的對應：打卡↔考勤、報帳↔報帳、群組↔群組助理
const PAIR: Partial<Record<SurfaceId, SurfaceId>> = {
  punch: 'attend',
  attend: 'punch',
  myexpense: 'expense',
  expense: 'myexpense',
  groups: 'gs',
  gs: 'groups',
};
const slugsOf = (s: Surface) => s.slugs ?? (s.slug ? [s.slug] : []);
/** 沒有公司概念的工具（個人側的群組）：對應時只比工具。有公司但查不到（slugs 空陣列）不算 */
const companyless = (s: Surface) => s.slugs === undefined && !s.slug;

/**
 * 點角色開關要去哪（/go/@me、/go/@admin，審查 F16、F31）：
 *   1. from 已經在目標角色 → 原地不動（回 from）
 *   2. 同一個工具的另一邊；兩邊都有公司時要同一家（交集），一邊沒有公司（群組）只比工具
 *   3. 目標角色上次用的（lastKey）
 *   4. 目標角色第一個
 *   目標角色沒有東西 → null（呼叫端送回 landing）
 */
export function resolveRoleJump(g: Grouped, target: Side, fromKey?: string | null, lastKey?: string | null): Surface | null {
  const all = itemsOf(g, target);
  if (!all.length) return null;
  const from = [...itemsOf(g, 'me'), ...itemsOf(g, 'admin')].find((s) => s.key === fromKey);
  if (from && sideOf(from.role) === target) return from;
  if (from) {
    const want = PAIR[from.id];
    const cands = all.filter((s) => s.id === want);
    const fs = slugsOf(from);
    for (const c of cands) {
      if (companyless(from) || companyless(c) || slugsOf(c).some((x) => fs.includes(x))) return c;
    }
  }
  return all.find((s) => s.key === lastKey) ?? all[0];
}

/**
 * /go/<key> 要去哪：@me／@admin 走角色開關規則；其他 key 必須在清單裡（不能拿來跳到別人的後台）。
 * 回 null → 呼叫端送回落地頁。lastOf 給「該角色上次用的」cookie 值。
 */
export function goTarget(list: Surface[], key: string, from: string | null, lastOf: (side: Side) => string | undefined): Surface | null {
  if (key === '@me' || key === '@admin') {
    const side: Side = key === '@me' ? 'me' : 'admin';
    return resolveRoleJump(groupSurfaces(list), side, from, lastOf(side));
  }
  return list.find((x) => x.key === key) ?? null;
}

/**
 * 首頁 / 要做什麼（審查 F6）：
 *   redirect＝直接進去（只有一種身分、或記得上次選的）；menu＝顯示選單；boot＝還沒登入，跑 LIFF 開機；none＝沒有任何身分
 *   ?menu=1 時只要有身分就顯示選單——連只有一種身分的人也是（原本會落到「這個帳號沒有可用的功能」）
 */
export function homeMode(listLength: number, hasUid: boolean, menu: boolean, hasLast: boolean): 'redirect' | 'menu' | 'boot' | 'none' {
  if (listLength > 0 && menu) return 'menu';
  if (listLength === 1) return 'redirect';
  if (listLength > 1) return hasLast ? 'redirect' : 'menu';
  return hasUid ? 'none' : 'boot';
}
