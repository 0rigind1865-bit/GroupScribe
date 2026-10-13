import { EXPENSE_CATEGORIES, parseAmount } from './receipt';
import { classifyNote } from './classify';
import { addDays } from '@/core/date';

// 文字／語音記帳（X2-6）：1:1 裡傳「午餐 120」「停車費150元」→ 記一筆。
// 寧可漏記也不要誤記：只認「短短一句、品項在前、金額在最後」，其他一律當一般筆記。

const RE = /^(?<item>[^\d$＄\s][^\d$＄]{0,14}?)\s*(?:NT)?[$＄]?\s*(?<amt>\d{1,3}(?:,\d{3})+|\d+)\s*(?<unit>元|塊)?$/i;
// 品項是時間、日期、數量詞 → 不是花費（「明天 3」「會議 2 點」「第 3」）
const NOT_ITEM = /(今天|明天|昨天|後天|點|時|分鐘|號|日|月|年|週|星期|樓|個|次|人|位|天|歲|第|號碼|電話|分機)$|^(週|星期|禮拜)/;

// 「便當 中午 110元 20個」→ 單價×數量（2026-09-29 這種句子整句沒中）。要同時有錢（元／塊／$）和數量（20個、×20）才算。
// 也認「數量X20 單價110」這種寫了標籤、單價沒寫元的句子。
// 錢寫在數量前面＝單價（110元 20個）；數量在前＝總價（2杯 120元）；寫了「每／單價」或「共／合計」就照字面
const PRICE = /(?:NT)?[$＄]\s*(\d{1,3}(?:,\d{3})+|\d+)|(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)\s*(?:元|塊)|單價\s*[:：]?\s*(?:NT)?[$＄]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(?:元|塊)?/gi;
const QTY = /[x×*＊]\s*(\d{1,3})(?!\d)|(?<!\d)(\d{1,3})\s*(?:個|份|盒|杯|瓶|包|件|組|張|箱|顆|支|條|套|罐|袋)|數量\s*[:：]?\s*[x×*＊]?\s*(\d{1,3})(?!\d)/gi;

export type Hit = { item: string; amount: number; category: string; kind?: 'income' };

// 收入：「收入 薪水 50000」「進帳 3萬」「+500 退款」；句尾「…收入」也算。沒寫元時金額要 ≥100，免得「收到 3 箱貨」被當 3 元收入
const INCOME_RE = /^(?:\+|收入|進帳|入帳|收款)\s*|\s*(?:收入|進帳|入帳)$/;
const INCOME_AMT = /(?:NT)?[$＄]?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(萬|千|元|塊)?/;

function parseIncome(t: string): Hit | null {
  const m = t.match(INCOME_AMT);
  if (!m) return null;
  let amount = Number(m[1].replace(/,/g, ''));
  if (m[2] === '萬') amount *= 10000;
  else if (m[2] === '千') amount *= 1000;
  amount = Math.round(amount);
  const hasUnit = !!m[2] || /[$＄]/.test(t);
  if (!amount || (!hasUnit && amount < 100)) return null;
  const item = t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() || '收入';
  if (NOT_ITEM.test(item)) return null;
  return { item: item.slice(0, 30), amount, category: '收入', kind: 'income' };
}

// alt：數量在前、又沒寫「每／共」時，單價或總價都說得通——主答案照舊當總價，另一種放 alt，交給 AI 用常識挑（record.ts）
function parseWithQty(t: string, categories: readonly string[]): (Hit & { alt?: Hit }) | null {
  const p = [...t.matchAll(PRICE)];
  const q = [...t.matchAll(QTY)];
  if (p.length !== 1 || q.length !== 1) return null;
  const price = parseAmount(p[0][1] ?? p[0][2] ?? p[0][3]);
  const qty = Number(q[0][1] ?? q[0][2] ?? q[0][3]);
  if (!price || !qty) return null;
  const before = p[0].index! < q[0].index!;
  const word = /每|單價|@|共|合計|總計/.test(t);
  const each = /每|單價|@/.test(t) || (!/共|合計|總計/.test(t) && before);
  const item = t.replace(p[0][0], ' ').replace(q[0][0], ' ').replace(/每個|每|單價|@|總共|一共|共|合計|總計/g, ' ').replace(/\s+/g, ' ').trim();
  if (!item || /\d/.test(item) || NOT_ITEM.test(item)) return null;
  const category = classifyNote(item, categories) ?? '雜支';
  // 算式留在品項裡：回覆看得到「110×20」，乘錯一眼就知道
  const eachHit = { item: `${item} ${price}×${qty}`, amount: price * qty, category };
  const totalHit = { item: `${item} ${q[0][0].trim()}`, amount: price, category };
  const hit = each ? eachHit : totalHit;
  return !word && !before ? { ...hit, alt: each ? totalHit : eachHit } : hit;
}

/** 句子裡提到公司已有的專案名稱 → 回那個名稱（多個中取最長的）；專案同時當地點用。只認已有的，不從句子猜新專案 */
export function pickProject(text: string, projects: readonly string[]): string {
  return projects.filter((p) => p.length >= 2 && text.includes(p)).sort((a, b) => b.length - a.length)[0] ?? '';
}

const TIME_WORD = /^(今天|昨天|前天|早上|上午|中午|下午|傍晚|晚上|半夜|凌晨)$/;

// 句子裡的時間字：「昨天中午 便當 110元」「10/3 停車 50」「下午3點半 咖啡 55」
const DAY_WORD: Record<string, number> = { 今天: 0, 今日: 0, 昨天: -1, 昨日: -1, 前天: -2, 大前天: -3 };
const PERIOD_HOUR: Record<string, number> = { 凌晨: 4, 早上: 8, 早晨: 8, 上午: 10, 中午: 12, 下午: 15, 傍晚: 18, 晚上: 19, 晚間: 19, 半夜: 23 };
const DAY_RE = /大前天|前天|昨天|昨日|今天|今日/;
const MD_RE = /(?<![\d/])(\d{1,2})[/月](\d{1,2})(?:日|號)?(?![\d/])/;
const PERIOD_RE = /凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚間|半夜/;
const HOUR_RE = /(?<!\d)(\d{1,2})(?:點(?:(半)|(\d{1,2})分)?|:(\d{2}))(?!\d)/;
const taipeiYmd = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

export type When = { date: string | null; time: string | null; rest: string };

/**
 * 句子裡提到的日期／時間（台北時區）。date＝YYYY-MM-DD、time＝HH:MM，沒提到的為 null；rest＝拿掉時間字後的句子（給品項規則用）。
 * ponytail: 月／日不帶年就用訊息那年；「上週三」「禮拜五」這種交給 AI 路徑（record.ts）
 */
export function pickWhen(text: string, at: Date): When {
  let rest = text;
  let date: string | null = null;
  let time: string | null = null;
  const day = rest.match(DAY_RE);
  if (day) {
    date = addDays(taipeiYmd(at), DAY_WORD[day[0]]);
    rest = rest.replace(day[0], ' ');
  }
  const md = rest.match(MD_RE);
  if (md) {
    const y = taipeiYmd(at).slice(0, 4);
    const mo = Number(md[1]);
    const d = Number(md[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      rest = rest.replace(md[0], ' ');
    }
  }
  const period = rest.match(PERIOD_RE);
  if (period) rest = rest.replace(period[0], ' ');
  const hm = rest.match(HOUR_RE);
  if (hm) {
    let h = Number(hm[1]);
    const m = hm[2] ? 30 : Number(hm[3] ?? hm[4] ?? 0);
    if (period && PERIOD_HOUR[period[0]] >= 12 && h < 12) h += 12; // 下午3點 → 15
    if (h <= 23 && m <= 59) {
      time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      rest = rest.replace(hm[0], ' ');
    }
  } else if (period) {
    time = `${String(PERIOD_HOUR[period[0]]).padStart(2, '0')}:00`;
  }
  return { date, time, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** 寫進 expenses 的 spent_on／spent_at：句子有講就照句子，沒講就用訊息時間 */
export function spentFields(at: Date, date: string | null, time: string | null): { spent_on: string; spent_at: string | null } {
  if (!date && !time) return { spent_on: taipeiYmd(at), spent_at: at.toISOString() };
  const spent_on = date ?? taipeiYmd(at);
  return { spent_on, spent_at: time ? new Date(`${spent_on}T${time}:00+08:00`).toISOString() : null };
}

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

/** 「品項＋金額」→ { item, amount, category }；看起來不像花費 → null */
export function parseTextExpense(text: string, categories: readonly string[]): (Hit & { alt?: Hit }) | null {
  const t = text.trim();
  if (!t || t.length > 30 || t.includes('\n')) return null;
  if (INCOME_RE.test(t)) return parseIncome(t.replace(INCOME_RE, '').trim());
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
