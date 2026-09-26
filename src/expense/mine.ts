import { getDb } from '@/db';
import { liffUser } from '@/core/liff';
import { orgHasExpense } from './record';
import { isMissingModulesColumn, scopedModuleIds } from '@/org/module-ids';
import { PAY_METHODS, parseAmount, parseDate } from './receipt';

// 我的報帳（X2／Snaptab 全功能移植）：身分一律從 LIFF session 反查，絕不信表單傳來的人或公司。
// 能用的人：所屬公司有開報帳的「管理者」（org_members）或「在職員工」（employees active）。
// canManage：管理者才能改分類、改案場名稱（影響全公司）。
export type ExpenseMe = { org_id: string; line_user_id: string; display_name: string; canManage: boolean };

export async function myExpenseIdentity(): Promise<ExpenseMe | null> {
  const uid = await liffUser();
  if (!uid) return null;
  const db = getDb();
  const members = (cols: string) => db.from('org_members').select(cols).eq('line_user_id', uid);
  const [first, { data: emps }] = await Promise.all([
    members('org_id, display_name, role, modules'),
    db.from('employees').select('org_id, display_name').eq('line_user_id', uid).eq('status', 'active'),
  ]);
  const mem = (isMissingModulesColumn(first.error) ? (await members('org_id, display_name, role')).data : first.data) as
    | { org_id: string; display_name: string | null; role: string; modules?: unknown }[]
    | null;
  for (const m of mem ?? [])
    // 管理者身分只算「被授權管報帳」的（migration 028）；只管考勤的人走下面的員工身分
    if (scopedModuleIds(['expense'], m.role, m.modules ?? null).length && (await orgHasExpense(m.org_id))) {
      const emp = (emps ?? []).find((e) => e.org_id === m.org_id);
      return { org_id: m.org_id, line_user_id: uid, display_name: emp?.display_name ?? m.display_name ?? '我', canManage: true };
    }
  for (const e of emps ?? [])
    if (await orgHasExpense(e.org_id)) return { org_id: e.org_id, line_user_id: uid, display_name: e.display_name, canManage: false };
  return null;
}

export type ExpenseInput = {
  amount: number;
  spent_on: string;
  spent_at: string | null;
  category: string;
  pay_method: string;
  project: string;
  note: string;
  vendor: string;
  invoice_no: string;
  lat: number | null;
  lng: number | null;
  place_name: string;
};

const num = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number(v);
  return v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const taipeiDate = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

/** 網頁表單 → 一筆報帳；金額或分類不合法 → null。today＝台北今天（日期沒填時用） */
export function parseExpenseForm(form: FormData, categories: readonly string[], today: string): ExpenseInput | null {
  const amount = parseAmount(String(form.get('amount') ?? ''));
  const category = String(form.get('category') ?? '');
  if (amount === null || !categories.includes(category)) return null;
  const pay = String(form.get('pay_method') ?? '代墊');
  const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
  const lat = num(form.get('lat'), -90, 90);
  const lng = num(form.get('lng'), -180, 180);
  // 精確時間（Snaptab 記到分鐘）：前端送 ISO；不合法就不存，退回只記日期
  const at = new Date(String(form.get('spent_at') ?? ''));
  const spent_at = Number.isFinite(at.getTime()) ? at.toISOString() : null;
  const inv = text('invoice_no', 20).replace(/[-\s]/g, '').toUpperCase();
  return {
    amount,
    spent_at,
    spent_on: spent_at ? taipeiDate(at) : (parseDate(String(form.get('spent_on') ?? '')) ?? today),
    category,
    pay_method: (PAY_METHODS as readonly string[]).includes(pay) ? pay : '代墊',
    project: text('project', 60),
    note: text('note', 200),
    vendor: text('vendor', 80),
    invoice_no: /^[A-Z]{2}\d{8}$/.test(inv) ? inv : '',
    // 座標要成對才存（X2-7）
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
    place_name: text('place_name', 60),
  };
}
