import { getDb } from '@/db';
import { EXPENSE_CATEGORIES } from './receipt';

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
