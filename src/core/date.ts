// 日期共用工具。逾期判斷的單一真相來源——「今天」、「待辦」、LIFF 成員頁三處都用它，
// 否則同一筆待辦在三個畫面會長得不一樣（principles.md：一致性）。
// 放 core/ 而不是 app/(admin)/：LIFF 成員頁也要用，不該去 import 管理版路由群組底下的東西。

export const todayISO = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

export const isOverdue = (dueIso: string | null | undefined, today = todayISO()) => !!dueIso && dueIso < today;

// 日期的唯一顯示格式：8/13（週四）。跨年才補年份——同一個期限曾經在三個頁面長成
// 「2026-08-13」「8/13（週四）」「08/13」三種寫法，讀者得自己換算才知道是不是同一天。
// 帶星期是刻意的：待辦與行程都是拿來排工作的，「幾號」不如「禮拜幾」有用。
export function fmtDate(iso: string, today = todayISO()): string {
  const wd = new Date(`${iso}T12:00:00Z`).toLocaleDateString('zh-TW', {
    timeZone: 'UTC',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  return iso.slice(0, 4) === today.slice(0, 4) ? wd : `${iso.slice(0, 4)} ${wd}`;
}

// 待確認有兩種來源，人要付出的注意力不同：
//   新抽取＝從沒看過，判斷「這件事存在嗎」
//   已更新＝AI 依後續對話改了既有項目（extract.ts 的 update_* 一律重設 needs_confirmation），
//           判斷「改得對嗎」——你原本確認過的結論可能已經不成立
// 不需要新欄位：所有人工編輯路徑都會把 needs_confirmation 清成 false（管理版與 LIFF 的 save 皆然），
// 所以「還在待確認 ＋ 改過時間」只可能是 AI 動的手。
export const isRevised = (i: { created_at?: string | null; updated_at?: string | null }) =>
  !!i.created_at && !!i.updated_at && new Date(i.updated_at).getTime() - new Date(i.created_at).getTime() > 60_000;

// 已忽略的項目不該再喊「待確認」——忽略本身就是人做過的判斷。
// （ignore 動作只改 status、不清 needs_confirmation，所以這個條件必須在 UI 層擋。）
export const needsReview = (i: { needs_confirmation?: boolean; status?: string | null }) =>
  !!i.needs_confirmation && i.status !== 'ignored';
