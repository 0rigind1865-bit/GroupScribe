import { myEmployees, type Employee } from '@/attend/auth';
import { orgHasExpense } from './record';
import { PAY_METHODS, parseAmount, parseDate } from './receipt';

// 員工自己記帳（X2-1／X2-2）：身分一律從 LIFF session 反查（myEmployees），絕不信表單傳來的人或公司。
// 只有「在職（active）且所屬公司有開報帳」的員工能用。
export async function myExpenseEmployee(): Promise<Employee | null> {
  for (const e of await myEmployees()) {
    if (e.status === 'active' && (await orgHasExpense(e.org_id))) return e;
  }
  return null;
}

export type ExpenseInput = {
  amount: number;
  spent_on: string;
  category: string;
  pay_method: string;
  project: string;
  note: string;
  vendor: string;
  lat: number | null;
  lng: number | null;
  place_name: string;
};

const num = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number(v);
  return v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** 網頁表單 → 一筆報帳；金額或分類不合法 → null。today＝台北今天（日期沒填時用） */
export function parseExpenseForm(form: FormData, categories: readonly string[], today: string): ExpenseInput | null {
  const amount = parseAmount(String(form.get('amount') ?? ''));
  const category = String(form.get('category') ?? '');
  if (amount === null || !categories.includes(category)) return null;
  const pay = String(form.get('pay_method') ?? '代墊');
  const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
  const lat = num(form.get('lat'), -90, 90);
  const lng = num(form.get('lng'), -180, 180);
  return {
    amount,
    spent_on: parseDate(String(form.get('spent_on') ?? '')) ?? today,
    category,
    pay_method: (PAY_METHODS as readonly string[]).includes(pay) ? pay : '代墊',
    project: text('project', 60),
    note: text('note', 200),
    vendor: text('vendor', 80),
    // 座標要成對才存（X2-7）
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
    place_name: text('place_name', 60),
  };
}
