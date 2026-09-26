import { cache as reqCache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { verifyAdminSession } from '@/core/auth';
import { liffUser } from '@/core/liff';
import { enabledModuleIds, isMissingModulesColumn, scopedModuleIds, type ModuleId } from './module-ids';

// 多租戶（migration 012）：org 解析與授權的唯一收口。
// 隔離策略：org_id 只掛 groups/channels 兩個實體表，其餘表經 group_id 間接歸屬——
// 所以「org 隔離」的執行點就是這裡的 orgGroups()（只回該 org 的群組）
// 與各查詢自帶的 .eq('org_id', ...)。頁面拿到的群組清單已過濾，
// scopedGroup() 對不在清單內的 ?group= 會自動退回第一個合法群組，跨 org 撈不到資料。
//
// 身分兩種：
//   平台擁有者 = gs_auth 密碼 session（視同所有 org 的 owner；ADMIN_PASSWORD 後門）
//   org 管理員 = gs_liff LINE 身分 + org_members 查表（每次請求查 DB，撤權立即生效）

export type Org = { id: string; slug: string; name: string };

// org 極少變動；30 秒 TTL 快取省掉每頁一次查詢（比照 settings.ts 的做法）
const cache = new Map<string, { org: Org | null; at: number }>();
const TTL = 30_000;

export async function orgBySlug(slug: string): Promise<Org | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL) return hit.org;
  const { data } = await getDb().from('orgs').select('id, slug, name').eq('slug', slug).maybeSingle();
  const org = (data as Org | null) ?? null;
  cache.set(slug, { org, at: Date.now() });
  return org;
}

/** gs_auth 密碼 session 是否有效（平台擁有者） */
export async function isPlatformOwner(): Promise<boolean> {
  return verifyAdminSession((await cookies()).get('gs_auth')?.value);
}

export type OrgMember = { role: 'owner' | 'admin'; modules: unknown };

/** 目前 LIFF 使用者在該 org 的管理者列（角色＋被授權的模組）；非成員回 null */
export async function orgMember(orgId: string): Promise<OrgMember | null> {
  const userId = await liffUser();
  if (!userId) return null;
  const q = (cols: string) => getDb().from('org_members').select(cols).eq('org_id', orgId).eq('line_user_id', userId).maybeSingle();
  let { data, error } = await q('role, modules');
  // migration 028 還沒跑（沒有 modules 欄）→ 退回只查角色＝既有行為，不能因此把所有管理員鎖在門外
  if (isMissingModulesColumn(error)) ({ data, error } = await q('role'));
  if (error) return null; // 其他錯誤一律當沒權限（fail closed）
  const row = data as unknown as { role: OrgMember['role']; modules?: unknown } | null;
  return row ? { role: row.role, modules: row.modules ?? null } : null;
}

/** 目前 LIFF 使用者在該 org 的角色；非成員回 null */
export async function orgRole(orgId: string): Promise<'owner' | 'admin' | null> {
  return (await orgMember(orgId))?.role ?? null;
}

export type OrgAccess = { org: Org; via: 'platform' | 'member' };

/** org 管理權驗證：平台擁有者或 org_members。無權回 null（呼叫端自行 404/redirect） */
export async function orgAdminAccess(slug: string): Promise<OrgAccess | null> {
  const org = await orgBySlug(slug);
  if (!org) return null;
  if (await isPlatformOwner()) return { org, via: 'platform' };
  if (await orgRole(org.id)) return { org, via: 'member' };
  return null;
}

/**
 * 模組管理端點的授權：公司有開這個模組，而且這位管理者被授權管它（org_members.modules）。
 * 考勤／報帳／群組助理的 API 一律走這支，不要再直接用 orgAdminAccess——
 * 否則只被授權考勤的人可以直接打群組助理的 API（tests/api-guard.test.ts 會擋）。
 */
export async function moduleAccess(slug: string, module: ModuleId): Promise<OrgAccess | null> {
  const org = await orgBySlug(slug);
  if (!org) return null;
  const owner = await isPlatformOwner();
  const member = owner ? null : await orgMember(org.id);
  if (!owner && !member) return null;
  // 平台擁有者＝全部模組（與 visibleModules 一致，不看公司開關）
  if (owner) return { org, via: 'platform' };
  const orgMods = enabledModuleIds((await orgSettings(org.id)).modules);
  return scopedModuleIds(orgMods, member!.role, member!.modules).includes(module) ? { org, via: 'member' } : null;
}

/**
 * 管理端每一頁的門禁：沒權限就 404。每支 page.tsx 開頭都要呼叫（tests/api-guard.test.ts 會擋）。
 *
 * 為什麼不能只靠 layout：Next 的 RSC 請求可以帶一份自稱「上層 layout 已經有了」的 router state，
 * 伺服器就只 render page、跳過 layout——layout 裡的 notFound() 根本不會執行。
 * 2026-09-26 在本機實測：非成員的 LINE 身分偽造這個 header，就能讀到任何公司的待辦。
 * 所以 layout 的檢查只算 UX，真正的門在這裡。
 */
export const requireModule = reqCache(async (slug: string, module: ModuleId): Promise<OrgAccess> => {
  const access = await moduleAccess(slug, module);
  if (!access) notFound();
  return access;
});

/** 該 org 的群組清單（groups_view 已含 org_id，migration 012）。頁面一律以此為準。 */
export async function orgGroups(orgId: string) {
  const { data } = await getDb()
    .from('groups_view')
    .select('group_id, name, category, picture_url')
    .eq('org_id', orgId)
    .order('last_at', { ascending: false });
  return data ?? [];
}

/** 驗證 group 屬於該 org（API route 從表單/URL 收到 group_id 時用） */
export async function assertGroupInOrg(orgId: string, groupId: string): Promise<boolean> {
  const { data } = await getDb().from('groups').select('group_id').eq('group_id', groupId).eq('org_id', orgId).maybeSingle();
  return !!data;
}

/** org 設定（org_settings，migration 012）。v1 只有考勤在用（attend_join_code 等）。 */
export async function orgSettings(orgId: string): Promise<Record<string, unknown>> {
  const { data } = await getDb().from('org_settings').select('*').eq('org_id', orgId).maybeSingle();
  return data ?? {};
}

// ── 群組助理 API 的門禁（商業計劃 2.1 節 A2）──
// 考勤模組的三重把關（orgAdminAccess → 查詢綁 org_id）照抄到群組助理：
// 群組助理的資料表以 group_id 為鍵，所以「綁 org」＝「綁該 org 的 groupIds」。

export type GsAccess = OrgAccess & {
  slug: string;
  base: string; // `/o/<slug>`，redirect 一律以此為前綴，別再寫死 /groups 這種舊路徑
  groupIds: string[];
  inOrg: (groupId: string) => boolean;
};

/** org slug 的來源：表單 name=org 優先；沒帶就取 Referer 的 /o/<slug>（同源表單與 fetch 都會送） */
export function orgSlugFrom(form: FormData | null, referer: string | null): string {
  const explicit = form ? String(form.get('org') ?? '').trim() : '';
  if (explicit) return explicit;
  const m = referer?.match(/^https?:\/\/[^/]+\/o\/([a-z0-9][a-z0-9-]{1,30})(?:[/?#]|$)/);
  return m?.[1] ?? '';
}

/** 群組助理 API 的唯一授權入口；回 null 由呼叫端 403 */
export async function gsAccess(req: NextRequest, form: FormData | null): Promise<GsAccess | null> {
  const slug = orgSlugFrom(form, req.headers.get('referer'));
  if (!slug) return null;
  const access = await moduleAccess(slug, 'gs');
  if (!access) return null;
  const groupIds = (await orgGroups(access.org.id)).map((g) => g.group_id);
  const set = new Set(groupIds);
  return { ...access, slug, base: `/o/${slug}`, groupIds, inOrg: (gid) => set.has(gid) };
}

/** 認領群組：沒有 groups 列就建在此 org（匯入的新群），已有列則不改歸屬；回傳是否屬於此 org */
export async function claimGroup(orgId: string, groupId: string): Promise<boolean> {
  await getDb()
    .from('groups')
    .upsert({ group_id: groupId, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'group_id', ignoreDuplicates: true });
  return assertGroupInOrg(orgId, groupId);
}
