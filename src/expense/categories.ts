import { getDb } from '@/db';
import { EXPENSE_CATEGORIES } from './receipt';
import { defaultIconFor, normalizeIcon } from './icon-names';

// 自訂分類（X2-4，Snaptab CategoryManager）：每家公司一份，存 org_settings.expense_categories。
// null、空、或欄位還不存在（migration 023 未跑）→ 用預設六類。

export const MAX_CATEGORIES = 20;
export const FALLBACK = '雜支'; // 讀不出分類時的歸處，清單裡一定要有

/** 管理頁的多行輸入 → 分類清單：去空白、去重、每個最多 10 字、最多 20 個，「雜支」一定在（沒寫就補在最後） */
export function normalizeCategories(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\n,，、]/)) {
    const c = raw.trim().slice(0, 10);
    if (c && !seen.has(c)) seen.add(c);
  }
  const list = [...seen].filter((c) => c !== FALLBACK).slice(0, MAX_CATEGORIES - 1);
  // 使用者自己把雜支排在某個位置就尊重，否則補在最後
  const pos = [...seen].indexOf(FALLBACK);
  if (pos >= 0 && pos < list.length) list.splice(pos, 0, FALLBACK);
  else list.push(FALLBACK);
  return list;
}

/** 幾份專案名單合成一份：去頭尾空白、去重、丟掉空的與「未分類」（檔案分類判斷不出來時存的），保留先後順序 */
export function mergeProjects(...lists: (string | null | undefined)[][]): string[] {
  const out = new Set<string>();
  for (const list of lists) for (const p of list) if (p?.trim() && p.trim() !== '未分類') out.add(p.trim());
  return [...out];
}

// 群→公司以 groups.org_id 為準（media_assets.org_id 程式不讀，見 migration 025）
async function orgGroupIds(orgId: string): Promise<string[]> {
  const { data } = await getDb().from('groups').select('group_id').eq('org_id', orgId);
  return (data ?? []).map((g) => g.group_id as string);
}

/**
 * 公司的專案清單（報帳和群組檔案共用同一份）：建立過的（expense_projects，migration 027 前查不到當空的）
 * ＋報帳紀錄用過的＋公司各群組檔案歸過的（media_assets.project，migration 007 前查不到當空的），新的在前
 */
export async function orgProjects(orgId: string): Promise<string[]> {
  const db = getDb();
  const groupIds = await orgGroupIds(orgId);
  const [{ data: named }, { data: used }, { data: files }] = await Promise.all([
    db.from('expense_projects').select('name').eq('org_id', orgId).order('created_at', { ascending: false }),
    db.from('expenses').select('project').eq('org_id', orgId).neq('project', '').order('created_at', { ascending: false }).limit(2000),
    groupIds.length
      ? db.from('media_assets').select('project, messages!inner(group_id)').in('messages.group_id', groupIds).not('project', 'is', null)
          .order('created_at', { referencedTable: 'messages', ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as { project: string }[] }),
  ]);
  return mergeProjects((named ?? []).map((p) => p.name), (used ?? []).map((p) => p.project), (files ?? []).map((f: any) => f.project));
}

/** 專案改名時，公司各群組裡歸在舊名下的檔案一起改（報帳紀錄由呼叫端改）；欄位還沒建（007）就略過 */
export async function renameFileProject(orgId: string, from: string, to: string): Promise<void> {
  const db = getDb();
  const groupIds = await orgGroupIds(orgId);
  if (!groupIds.length) return;
  const { data } = await db.from('media_assets').select('id, messages!inner(group_id)').eq('project', from).in('messages.group_id', groupIds);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length) await db.from('media_assets').update({ project: to }).in('id', ids);
}

export async function orgCategories(orgId: string): Promise<string[]> {
  const { data, error } = await getDb().from('org_settings').select('expense_categories').eq('org_id', orgId).maybeSingle();
  const list = !error && Array.isArray(data?.expense_categories) ? (data.expense_categories as string[]) : [];
  return list.length ? list : [...EXPENSE_CATEGORIES];
}

export type CategoryItem = { name: string; icon: string };

/** 分類＋圖示（Snaptab 的分類格用）；圖示沒設或欄位還不存在（migration 027）→ 依名稱猜 */
export async function orgCategoryItems(orgId: string): Promise<CategoryItem[]> {
  const [names, { data, error }] = await Promise.all([
    orgCategories(orgId),
    getDb().from('org_settings').select('expense_category_icons').eq('org_id', orgId).maybeSingle(),
  ]);
  const icons = (!error && data?.expense_category_icons && typeof data.expense_category_icons === 'object' ? data.expense_category_icons : {}) as Record<string, string>;
  return names.map((name) => ({ name, icon: icons[name] ? normalizeIcon(icons[name]) : defaultIconFor(name) }));
}

/** 儲存分類＋圖示（員工端管理者、後台共用）。名稱規則同 normalizeCategories；圖示欄位不存在時只存名稱 */
export async function saveCategoryItems(orgId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!Array.isArray(raw)) return { ok: false, error: '格式不對' };
  const items = raw.filter((x): x is { name: string; icon?: string } => !!x && typeof x.name === 'string');
  const names = normalizeCategories(items.map((x) => x.name).join('\n'));
  const icons: Record<string, string> = {};
  for (const x of items) if (names.includes(x.name.trim().slice(0, 10))) icons[x.name.trim().slice(0, 10)] = normalizeIcon(x.icon);
  const db = getDb();
  const now = new Date().toISOString();
  const { error } = await db.from('org_settings').update({ expense_categories: names, expense_category_icons: icons, updated_at: now }).eq('org_id', orgId);
  if (!error) return { ok: true };
  // migration 027 還沒跑：先只存名稱
  const { error: e2 } = await db.from('org_settings').update({ expense_categories: names, updated_at: now }).eq('org_id', orgId);
  return e2 ? { ok: false, error: '儲存失敗（migration 023 跑了嗎？）' } : { ok: true };
}
