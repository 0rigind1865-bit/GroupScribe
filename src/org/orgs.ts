import { cookies } from 'next/headers';
import { getDb } from '@/db';
import { verifyAdminSession } from '@/core/auth';
import { liffUser } from '@/core/liff';

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

/** 目前 LIFF 使用者在該 org 的角色；非成員回 null */
export async function orgRole(orgId: string): Promise<'owner' | 'admin' | null> {
  const userId = await liffUser();
  if (!userId) return null;
  const { data } = await getDb()
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('line_user_id', userId)
    .maybeSingle();
  return (data?.role as 'owner' | 'admin') ?? null;
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
