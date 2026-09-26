// 收據 → 一筆報帳的正規化（X1）。AI 讀出來的欄位不可信，全部在這裡收斂成可入庫的值。

// 跨行業的分類（不照搬 Snaptab 的「加油／便當」——那是單一行業的詞）
export const EXPENSE_CATEGORIES = ['交通', '餐飲', '住宿', '停車過路', '材料耗材', '雜支'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// 付款方式（Snaptab）：代墊要請款、公司卡要核銷，流程不同，加總時分開
export const PAY_METHODS = ['代墊', '公司卡', '現金'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export type Receipt = {
  amount: number;
  spent_on: string; // YYYY-MM-DD
  vendor: string;
  category: string;
  invoice_no: string;
};

const INVOICE_RE = /^[A-Z]{2}\d{8}$/;

/** 金額：去逗號、「元」「NT$」等，轉整數；非正數或讀不出來 → null */
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[,，\s]/g, '').replace(/^(NT\$|NTD|\$|＄)/i, '').replace(/(元|塊|NTD)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return n > 0 ? n : null;
}

/** 日期：YYYY-MM-DD、YYYY/MM/DD、民國 113/09/25；不合法 → null */
export function parseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{2,4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 1000) y += 1911; // 民國年
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** AI 回的 receipt 物件 → Receipt；不是收據或金額讀不出來 → null。fallbackDate＝訊息日期；categories＝該公司的分類 */
export function parseReceipt(raw: unknown, fallbackDate: string, categories: readonly string[] = EXPENSE_CATEGORIES): Receipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const amount = parseAmount(r.amount);
  if (amount === null) return null;
  const cat = String(r.category ?? '').trim();
  const inv = String(r.invoice_no ?? '').replace(/[-\s]/g, '').toUpperCase();
  return {
    amount,
    spent_on: parseDate(r.date) ?? fallbackDate,
    vendor: String(r.vendor ?? '').trim().slice(0, 80),
    category: categories.includes(cat) ? cat : '雜支',
    invoice_no: INVOICE_RE.test(inv) ? inv : '',
  };
}
