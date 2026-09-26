import { EXPENSE_CATEGORIES, parseAmount } from './receipt';
import { classifyNote } from './classify';

// 文字／語音記帳（X2-6）：1:1 裡傳「午餐 120」「停車費150元」→ 記一筆。
// 寧可漏記也不要誤記：只認「短短一句、品項在前、金額在最後」，其他一律當一般筆記。

const RE = /^(?<item>[^\d$＄\s][^\d$＄]{0,14}?)\s*(?:NT)?[$＄]?\s*(?<amt>\d{1,3}(?:,\d{3})+|\d+)\s*(?<unit>元|塊)?$/i;
// 品項是時間、日期、數量詞 → 不是花費（「明天 3」「會議 2 點」「第 3」）
const NOT_ITEM = /(今天|明天|昨天|後天|點|時|分鐘|號|日|月|年|週|星期|樓|個|次|人|位|天|歲|第|號碼|電話|分機)$|^(週|星期|禮拜)/;

// 分類改用報帳頁同一套 AI 分類（classify.ts），猜不出來歸「雜支」
export function guessCategory(item: string, categories: readonly string[]): string {
  return classifyNote(item, categories) ?? '雜支';
}

/** 「品項＋金額」→ { item, amount, category }；看起來不像花費 → null */
export function parseTextExpense(text: string, categories: readonly string[]): { item: string; amount: number; category: string } | null {
  const t = text.trim();
  if (!t || t.length > 30 || t.includes('\n')) return null;
  const m = t.match(RE);
  if (!m?.groups) return null;
  const item = m.groups.item.trim();
  if (NOT_ITEM.test(item)) return null;
  const amount = parseAmount(m.groups.amt);
  if (amount === null) return null;
  // 要有「這是錢」的證據才記：寫了元／塊／$，或品項看得出是花費（AI 分類認得，例如午餐、計程車）。
  // 只有「某某＋數字」不算——「測試456」「房號 305」曾被誤記成報帳（2026-09-26）
  const hasUnit = !!m.groups.unit || /[$＄]/.test(t);
  const known = classifyNote(item, categories);
  // 公司自訂分類裡沒有對應類別時（例如沒有「餐飲」），用預設分類判斷「這是不是花費」，分類則歸雜支
  const isSpend = !!known || !!classifyNote(item, EXPENSE_CATEGORIES);
  if (!hasUnit && !isSpend) return null;
  if (!hasUnit && amount < 10) return null; // 「午餐 3」多半不是錢
  return { item, amount, category: known ?? '雜支' };
}
