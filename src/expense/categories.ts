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
