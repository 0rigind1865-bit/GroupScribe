import { EXPENSE_CATEGORIES, parseAmount } from './receipt';
import { classifyNote } from './classify';

// 文字／語音記帳（X2-6）：1:1 裡傳「午餐 120」「停車費150元」→ 記一筆。
// 寧可漏記也不要誤記：只認「短短一句、品項在前、金額在最後」，其他一律當一般筆記。

const RE = /^(?<item>[^\d$＄\s][^\d$＄]{0,14}?)\s*(?:NT)?[$＄]?\s*(?<amt>\d{1,3}(?:,\d{3})+|\d+)\s*(?<unit>元|塊)?$/i;
// 品項是時間、日期、數量詞 → 不是花費（「明天 3」「會議 2 點」「第 3」）
const NOT_ITEM = /(今天|明天|昨天|後天|點|時|分鐘|號|日|月|年|週|星期|樓|個|次|人|位|天|歲|第|號碼|電話|分機)$|^(週|星期|禮拜)/;

// 「便當 中午 110元 20個」→ 單價×數量（2026-09-29 這種句子整句沒中）。要同時有錢（元／塊／$）和數量（20個、×20）才算。
// 錢寫在數量前面＝單價（110元 20個）；數量在前＝總價（2杯 120元）；寫了「每／單價」或「共／合計」就照字面
const PRICE = /(?:NT)?[$＄]\s*(\d{1,3}(?:,\d{3})+|\d+)|(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)\s*(?:元|塊)/gi;
const QTY = /[x×*＊]\s*(\d{1,3})(?!\d)|(?<!\d)(\d{1,3})\s*(?:個|份|盒|杯|瓶|包|件|組|張|箱|顆|支|條|套|罐|袋)/gi;

function parseWithQty(t: string, categories: readonly string[]): { item: string; amount: number; category: string } | null {
  const p = [...t.matchAll(PRICE)];
  const q = [...t.matchAll(QTY)];
  if (p.length !== 1 || q.length !== 1) return null;
  const price = parseAmount(p[0][1] ?? p[0][2]);
  const qty = Number(q[0][1] ?? q[0][2]);
  if (!price || !qty) return null;
  const each = /每|單價|@/.test(t) || (!/共|合計|總計/.test(t) && p[0].index! < q[0].index!);
  const item = t.replace(p[0][0], ' ').replace(q[0][0], ' ').replace(/每個|每|單價|@|總共|一共|共|合計|總計/g, ' ').replace(/\s+/g, ' ').trim();
  if (!item || /\d/.test(item) || NOT_ITEM.test(item)) return null;
  // 算式留在品項裡：回覆看得到「110×20」，乘錯一眼就知道
  return each
    ? { item: `${item} ${price}×${qty}`, amount: price * qty, category: classifyNote(item, categories) ?? '雜支' }
    : { item: `${item} ${q[0][0].trim()}`, amount: price, category: classifyNote(item, categories) ?? '雜支' };
}

/** 句子裡提到公司已有的專案名稱 → 回那個名稱（多個中取最長的）；專案同時當地點用。只認已有的，不從句子猜新專案 */
export function pickProject(text: string, projects: readonly string[]): string {
  return projects.filter((p) => p.length >= 2 && text.includes(p)).sort((a, b) => b.length - a.length)[0] ?? '';
}

const TIME_WORD = /^(今天|昨天|前天|早上|上午|中午|下午|傍晚|晚上|半夜|凌晨)$/;

/**
 * 沒對到專案時的地點：品項第一個詞不是花費、也不是時間 → 當地點（「林口體育館 便當 110×20」「全家 咖啡」）。
 * LINE 文字拿不到定位（網頁記帳才有），只能看字。
 * ponytail: 「老王 便當」會把老王當地點——地點只是標籤、回覆看得到、改得回來；真的常錯再改成只認地點字尾
 */
export function pickPlace(item: string, categories: readonly string[]): string {
  const words = item.split(' ').filter((w) => w && !/\d/.test(w));
  const first = words[0];
  if (words.length < 2 || TIME_WORD.test(first)) return '';
  return classifyNote(first, categories) || classifyNote(first, EXPENSE_CATEGORIES) ? '' : first.slice(0, 60);
}

// 分類改用報帳頁同一套 AI 分類（classify.ts），猜不出來歸「雜支」
export function guessCategory(item: string, categories: readonly string[]): string {
  return classifyNote(item, categories) ?? '雜支';
}

/** 「品項＋金額」→ { item, amount, category }；看起來不像花費 → null */
export function parseTextExpense(text: string, categories: readonly string[]): { item: string; amount: number; category: string } | null {
  const t = text.trim();
  if (!t || t.length > 30 || t.includes('\n')) return null;
  const withQty = parseWithQty(t, categories);
  if (withQty) return withQty;
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
