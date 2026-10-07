import type { SupabaseClient } from '@supabase/supabase-js';
import { isSubmitted } from './items';

// 報帳清單的篩選（清單頁、統計頁、CSV 匯出共用同一套，三處才不會對不上）
// year：統計頁的「今年」（YYYY）；month 有給時以 month 為準
export type ExpenseFilter = { status?: string; who?: string; project?: string; month?: string; year?: string };

export type ExpenseRow = {
  id: string;
  line_user_id: string;
  person_name: string | null;
  media_asset_id: string | null;
  spent_on: string;
  amount: number;
  category: string;
  vendor: string;
  note: string;
  project: string;
  invoice_no: string;
  reimbursed_at: string | null;
  created_at: string;
  media_assets: { storage_path: string } | null;
  // v2（migration 023）；還沒跑時不存在
  pay_method?: string;
  source?: string;
  photo_path?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_name?: string;
  spent_at?: string | null; // v3（migration 027）
  submitted_at?: string | null; // migration 030
};

export const isMonth = (m?: string): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** 回 { data, error }；error 多半是 migration 022 還沒跑。
 *  「還沒核銷」只算員工按過「申請核銷」的（migration 030）；還沒申請的只在「全部」看得到 */
export async function expenseQuery(db: SupabaseClient, orgId: string, f: ExpenseFilter) {
  let q = db
    .from('expenses')
    // * 而非列欄位名：v2 欄位（migration 023）還沒建時查詢也不會失敗
    .select('*, media_assets(storage_path)')
    .eq('org_id', orgId);
  if (f.status === 'done') q = q.not('reimbursed_at', 'is', null);
  else if (f.status !== 'all') q = q.is('reimbursed_at', null); // 預設：還沒核銷的
  if (f.who) q = q.eq('line_user_id', f.who);
  if (f.project) q = q.eq('project', f.project);
  if (isMonth(f.month)) q = q.gte('spent_on', `${f.month}-01`).lt('spent_on', `${nextMonth(f.month)}-01`);
  else if (f.year && /^\d{4}$/.test(f.year)) q = q.gte('spent_on', `${f.year}-01-01`).lt('spent_on', `${Number(f.year) + 1}-01-01`);
  // ponytail: 單頁上限 1000 筆；一家公司一個月超過再做分頁
  const r = await q.order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
  // ponytail: 在這裡濾而不是 SQL 濾——沒貼 030 時 submitted_at 不存在，SQL 會整個查詢失敗
  return f.status !== 'done' && f.status !== 'all' ? { ...r, data: r.data?.filter(isSubmitted) ?? null } : r;
}

/** 依 key 加總（統計頁用）：[[key, 金額合計, 筆數]]，金額大的先 */
export function sumBy(rows: Pick<ExpenseRow, 'amount'>[], key: (r: any) => string): [string, number, number][] {
  const m = new Map<string, [number, number]>();
  for (const r of rows) {
    const k = key(r) || '（未填）';
    const [a, n] = m.get(k) ?? [0, 0];
    m.set(k, [a + r.amount, n + 1]);
  }
  return [...m.entries()].map(([k, [a, n]]) => [k, a, n] as [string, number, number]).sort((x, y) => y[1] - x[1]);
}
