import type { SupabaseClient } from '@supabase/supabase-js';

// 報帳清單的篩選（清單頁、報帳頁、CSV 匯出共用同一套，三處才不會對不上）
export type ExpenseFilter = { status?: string; who?: string; project?: string; month?: string };

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
  media_assets: { storage_path: string } | null;
  // v2（migration 023）；還沒跑時不存在
  pay_method?: string;
  source?: string;
  photo_path?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_name?: string;
  spent_at?: string | null; // v3（migration 027）
};

export const isMonth = (m?: string): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** 回 { data, error }；error 多半是 migration 022 還沒跑 */
export function expenseQuery(db: SupabaseClient, orgId: string, f: ExpenseFilter) {
  let q = db
    .from('expenses')
    // * 而非列欄位名：v2 欄位（migration 023）還沒建時查詢也不會失敗
    .select('*, media_assets(storage_path)')
    .eq('org_id', orgId);
  if (f.status === 'done') q = q.not('reimbursed_at', 'is', null);
  else if (f.status !== 'all') q = q.is('reimbursed_at', null); // 預設：還沒報的
  if (f.who) q = q.eq('line_user_id', f.who);
  if (f.project) q = q.eq('project', f.project);
  if (isMonth(f.month)) q = q.gte('spent_on', `${f.month}-01`).lt('spent_on', `${nextMonth(f.month)}-01`);
  // ponytail: 單頁上限 1000 筆；一家公司一個月超過再做分頁
  return q.order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
}

/** 依 key 加總（報帳頁用）：[[key, 金額合計, 筆數]]，金額大的先 */
export function sumBy(rows: Pick<ExpenseRow, 'amount'>[], key: (r: any) => string): [string, number, number][] {
  const m = new Map<string, [number, number]>();
  for (const r of rows) {
    const k = key(r) || '（未填）';
    const [a, n] = m.get(k) ?? [0, 0];
    m.set(k, [a + r.amount, n + 1]);
  }
  return [...m.entries()].map(([k, [a, n]]) => [k, a, n] as [string, number, number]).sort((x, y) => y[1] - x[1]);
}

export type Pivot = { rows: string[]; cols: string[]; cell: (r: string, c: string) => number; rowTotal: (r: string) => number; colTotal: (c: string) => number; total: number };

/** 交叉加總（統計頁 X2-5）：列、欄各依合計由大到小；rowOrder 給定時列照它排（例如月份由新到舊） */
export function pivot<T extends { amount: number }>(rows: T[], rowKey: (r: T) => string, colKey: (r: T) => string, rowOrder?: (a: string, b: string) => number): Pivot {
  const cells = new Map<string, number>();
  const rt = new Map<string, number>();
  const ct = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const a = rowKey(r) || '（未填）';
    const b = colKey(r) || '（未填）';
    cells.set(`${a}\u0000${b}`, (cells.get(`${a}\u0000${b}`) ?? 0) + r.amount);
    rt.set(a, (rt.get(a) ?? 0) + r.amount);
    ct.set(b, (ct.get(b) ?? 0) + r.amount);
    total += r.amount;
  }
  const byTotal = (m: Map<string, number>) => (x: string, y: string) => (m.get(y) ?? 0) - (m.get(x) ?? 0);
  return {
    rows: [...rt.keys()].sort(rowOrder ?? byTotal(rt)),
    cols: [...ct.keys()].sort(byTotal(ct)),
    cell: (a, b) => cells.get(`${a}\u0000${b}`) ?? 0,
    rowTotal: (a) => rt.get(a) ?? 0,
    colTotal: (b) => ct.get(b) ?? 0,
    total,
  };
}
