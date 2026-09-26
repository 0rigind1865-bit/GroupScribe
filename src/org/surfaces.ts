import { cache } from 'react';
import { getDb } from '@/db';
import { liffUser, myGroups } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { isPlatformOwner } from './orgs';
import { enabledModuleIds, isMissingModulesColumn, scopedModuleIds } from './module-ids';
import { myExpenseIdentity } from '@/expense/mine';

// 全站「你能去哪些地方」的單一判定點。
//
// 為什麼需要它：使用者同時可能是群組成員、員工、org 管理員、平台擁有者，
// 所有人都從同一個 LINE 連結（LIFF）進來。這裡把身分收成一份清單：
//   首頁（src/app/page.tsx）：一種身分直接進去；兩種以上顯示選單、記住上次選的
//   切換器（SurfaceSwitcher）與「更多」頁：列出全部，一鍵換身分（經 /go/[key] 記住選擇）
//
// 身分怎麼判定（全部以 LINE 帳號編號為準，每次請求重查，撤權立即生效）：
//   打卡（個人）＝ employees 有這個 LINE 帳號
//   群組（個人）＝ 他「現在」在某個已認領的群裡（LINE 群成員 API，見 core/liff.ts myGroups）
//   群組助理／考勤／報帳（管理）＝ org_members 有他（每個 org 各一組，依該 org 開的模組 ∩ 他被授權的模組）；平台擁有者另加預設 org 全開
//   平台管理、未認領的群 ＝ 平台擁有者（後台密碼，或 ADMIN_LINE_USER_ID 的 LINE 帳號）

export type SurfaceId = 'groups' | 'punch' | 'myexpense' | 'gs' | 'attend' | 'expense' | 'platform' | 'unclaimed';

/** 角色（身分切換的第一層）：個人＝自己用；管理＝管公司；平台＝平台擁有者（畫面上歸在管理那一邊） */
export type SurfaceRole = 'me' | 'admin' | 'platform';

export type Surface = {
  key: string; // 唯一：同一人管多個 org 時 gs/attend 會各有一組（'gs:acme'）
  id: SurfaceId;
  label: string;
  desc: string; // 首頁選單的說明
  href: string;
  slug?: string; // 管理面向所屬的 org
  role: SurfaceRole;
  /** 管理面向所屬公司的名稱（選單分段標題、多家公司時的「考勤 · 公司A」） */
  orgName?: string;
  /** 個人面向（打卡、報帳）屬於哪幾家公司——角色開關「同一家公司」的對應要用；群組沒有公司 */
  slugs?: string[];
  /** 排序：數字小的先（員工的日常動作優先於管理動作） */
  rank: number;
};

export type Surfaces = {
  list: Surface[];
  /** 沒有任何面向＝這個 LINE 帳號與本系統無關（例如剛被踢出群組又不是員工） */
  landing: string | null;
};

type OrgRow = { slug: string; name: string; modules: Set<string> };

export const surfaces = cache(async (): Promise<Surfaces> => {
  const uid = await liffUser();
  const owner = await isPlatformOwner();
  const list: Surface[] = [];
  const db = getDb();

  // 1. 員工 → 打卡；1b. 公司有開報帳的在職員工或管理者 → 我的報帳（X2／Snaptab 全功能移植）
  // 兩者都帶所屬公司的 slug：角色開關從「打卡」切到「管理」時，要先找同一家公司的考勤
  const employees = uid ? await myEmployees() : [];
  const exp = uid ? await myExpenseIdentity() : null;
  const orgIds = [...new Set([...employees.map((e) => e.org_id), ...(exp ? [exp.org_id] : [])])];
  const slugOf = new Map<string, string>();
  if (orgIds.length) {
    const { data } = await db.from('orgs').select('id, slug').in('id', orgIds);
    for (const o of (data ?? []) as { id: string; slug: string }[]) slugOf.set(o.id, o.slug);
  }
  const slugsFor = (ids: string[]) => ids.map((id) => slugOf.get(id)).filter((x): x is string => !!x);
  if (employees.length) {
    list.push({ key: 'punch', id: 'punch', role: 'me', slugs: slugsFor(employees.map((e) => e.org_id)), label: '打卡', desc: '上下班打卡、補卡申請', href: '/a', rank: 1 });
  }
  if (exp) {
    list.push({ key: 'myexpense', id: 'myexpense', role: 'me', slugs: slugsFor([exp.org_id]), label: '報帳', desc: '記一筆代墊的錢、看自己的報帳單', href: '/a/expense', rank: 1.5 });
  }

  // 2. 群組成員 → 成員版（以「現在在不在群裡」為準，不是「有沒有講過話」）
  if (uid && (await myGroups(uid, { first: true })).length) {
    list.push({ key: 'groups', id: 'groups', role: 'me', label: '群組', desc: '看你所在群組的行程、待辦與公告', href: '/g', rank: 2 });
  }

  // 3. 管理員 → 每個 org 各一組（依該 org 開的模組）
  // 平台擁有者：列出所有租戶（原本只列預設 org——從平台頁點進別家時，身分列會說你在預設 org）。
  // 預設 org 維持三個模組全開（改版前的行為）；其他家以該公司 org_settings.modules 為準。
  const orgs: OrgRow[] = [];
  let hasUnclaimed = false;
  if (owner) {
    const def = process.env.DEFAULT_ORG_SLUG ?? 'main';
    const { data } = await db.from('orgs').select('slug, name, org_settings(modules)').order('created_at');
    for (const o of (data ?? []) as { slug: string; name: string | null; org_settings?: { modules?: unknown } | null }[]) {
      if (o.slug === 'unclaimed') {
        hasUnclaimed = true;
        continue;
      }
      const ids = o.slug === def ? ['gs', 'attend', 'expense'] : enabledModuleIds(o.org_settings?.modules);
      orgs.push({ slug: o.slug, name: o.name ?? o.slug, modules: new Set(ids) });
    }
    if (!orgs.some((o) => o.slug === def)) orgs.unshift({ slug: def, name: def, modules: new Set(['gs', 'attend', 'expense']) });
  }
  if (uid) {
    const q = (cols: string) => db.from('org_members').select(cols).eq('line_user_id', uid);
    let { data, error } = await q('role, modules, orgs(slug, name, org_settings(modules))');
    if (isMissingModulesColumn(error)) ({ data, error } = await q('role, orgs(slug, name, org_settings(modules))')); // migration 028 前
    for (const r of (data ?? []) as {
      role?: string;
      modules?: unknown;
      orgs?: { slug?: string; name?: string; org_settings?: { modules?: unknown } | null };
    }[]) {
      const o = r.orgs;
      if (!o?.slug || orgs.some((x) => x.slug === o.slug)) continue;
      // 公司開的 ∩ 這位管理者被授權的（migration 028）：只管考勤的人不會看到「群組管理」
      const ids = scopedModuleIds(enabledModuleIds(o.org_settings?.modules), r.role ?? null, r.modules ?? null);
      orgs.push({ slug: o.slug, name: o.name ?? o.slug, modules: new Set(ids) });
    }
  }
  // label 只是工具名；多家公司時的「考勤 · 公司A」由畫面依 orgName 組（src/org/surface-meta.tsx）
  orgs.forEach((o, i) => {
    // 公司優先排序（同一家的工具相鄰，選單才會照公司順序分段）；同一家裡群組助理最前——
    // 平台擁有者（用密碼登入、沒有 LINE 身分）的主場是群組助理
    const base = { slug: o.slug, orgName: o.name, role: 'admin' as const };
    if (o.modules.has('gs'))
      list.push({ ...base, key: `gs:${o.slug}`, id: 'gs', label: '群組助理', desc: '群組行程、待辦與收件匣把關', href: `/o/${o.slug}`, rank: 3 + i * 0.001 });
    if (o.modules.has('attend'))
      list.push({ ...base, key: `attend:${o.slug}`, id: 'attend', label: '考勤', desc: '員工、補卡審核、報表與薪資', href: `/o/${o.slug}/attend`, rank: 3 + i * 0.001 + 0.0001 });
    if (o.modules.has('expense'))
      list.push({ ...base, key: `expense:${o.slug}`, id: 'expense', label: '報帳', desc: '員工代墊的收據、核銷與匯出', href: `/o/${o.slug}/expense`, rank: 3 + i * 0.001 + 0.0002 });
  });

  // 4. 平台擁有者 → 平台管理（所有公司、未認領的群、改方案）
  // 「未認領的群」不是一家公司：歸在平台這一段（/o/unclaimed 底下的群組頁）
  if (owner) list.push({ key: 'platform', id: 'platform', role: 'platform', label: '平台管理', desc: '所有公司、未認領的群、方案', href: '/platform', rank: 5 });
  if (owner && hasUnclaimed)
    list.push({ key: 'unclaimed', id: 'unclaimed', role: 'platform', slug: 'unclaimed', label: '未認領的群', desc: '等管理員認領，7 天沒人要就退群', href: '/o/unclaimed/groups', rank: 5.1 });

  list.sort((a, b) => a.rank - b.rank);
  return { list, landing: list[0]?.href ?? null };
});
