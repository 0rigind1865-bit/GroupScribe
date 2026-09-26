import { parseAmount } from './receipt';

// 文字／語音記帳（X2-6）：1:1 裡傳「午餐 120」「停車費150元」→ 記一筆。
// 寧可漏記也不要誤記：只認「短短一句、品項在前、金額在最後」，其他一律當一般筆記。

const RE = /^(?<item>[^\d$＄\s][^\d$＄]{0,14}?)\s*(?:NT)?[$＄]?\s*(?<amt>\d{1,3}(?:,\d{3})+|\d+)\s*(?<unit>元|塊)?$/i;
// 品項是時間、日期、數量詞 → 不是花費（「明天 3」「會議 2 點」「第 3」）
const NOT_ITEM = /(今天|明天|昨天|後天|點|時|分鐘|號|日|月|年|週|星期|樓|個|次|人|位|天|歲|第|號碼|電話|分機)$|^(週|星期|禮拜)/;

// 預設分類的關鍵字（跨行業常見詞）；公司自訂分類時，品項剛好等於分類名就直接用
const KEYWORDS: [string, RegExp][] = [
  ['停車過路', /停車|過路|etag|etc/i],
  ['交通', /計程車|高鐵|台鐵|火車|捷運|公車|客運|油錢|加油|uber|機票|車資|車票/i],
  ['住宿', /住宿|飯店|旅館|民宿|酒店/],
  ['餐飲', /餐|飯|便當|咖啡|飲料|早點|宵夜|麵|點心|茶/],
  ['材料耗材', /材料|耗材|零件|文具|工具|五金|電池|膠帶/],
];

export function guessCategory(item: string, categories: readonly string[]): string {
  if (categories.includes(item)) return item;
  const hit = KEYWORDS.find(([c, re]) => categories.includes(c) && re.test(item));
  return hit ? hit[0] : '雜支';
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
  // 沒寫「元／$」時要 ≥10，避免「房間 3」這種編號被當成錢
  if (amount === null || (!m.groups.unit && !/[$＄]/.test(t) && amount < 10)) return null;
  return { item, amount, category: guessCategory(item, categories) };
}
