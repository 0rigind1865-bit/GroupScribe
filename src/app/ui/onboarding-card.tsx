import { oh } from '@/org/href';

// 上手卡（商業計劃 A7／U1）：新公司第一次進後台，需要的是「接下來做什麼」，不是一句「還沒有資料」。
// 三種狀態，由今天頁決定傳什麼：
//   沒有任何群        → 三步卡（取代整頁內容）
//   有群但訊息還很少   → 一小張「已收到 N 則，整理中」（放在內容上方）
//   其他              → 不顯示
// 「有沒有群」要看 groups 表而非 groups_view：未認領群不落地訊息，剛認領的群 0 則，
// groups_view 以 messages 為主表看不到它——之前用 groups_view 判斷，認領完還是一直看到三步卡。
export const FEW_MESSAGES = 20;

export function OnboardingCard({
  slug,
  botBasicId,
  hasGroups,
  messageCount,
}: {
  slug: string;
  botBasicId?: string | null; // LINE_BOT_BASIC_ID（含或不含 @ 都可）；沒設就不給加好友按鈕
  hasGroups: boolean;
  messageCount: number;
}) {
  if (hasGroups) {
    if (messageCount >= FEW_MESSAGES) return null;
    return (
      <div className="card mb-4 text-sm">
        <p className="font-semibold">已收到 {messageCount} 則，整理中</p>
        <p className="mt-1 text-gray-600">
          群裡照常講話就好。整理出的行程、待辦、公告會先進「收件匣」請你確認，確認過的才算數。
        </p>
      </div>
    );
  }

  const id = botBasicId?.trim().replace(/^@/, '');
  const step = (n: number) => (
    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{n}</span>
  );
  return (
    <div className="card">
      <p className="mb-3 font-semibold">三步開始</p>
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          {step(1)}
          <span>
            把<strong>群記</strong>邀進你的 LINE 工作群：打開群組 →「邀請」→ 選群記。
            {id ? (
              <>
                {' '}還沒加好友？{' '}
                <a className="text-emerald-700 underline" href={`https://line.me/R/ti/p/@${encodeURIComponent(id)}`}>
                  先加群記好友
                </a>
                。
              </>
            ) : null}
            <span className="mt-1 block text-xs text-gray-500">
              群記是「未認證」的官方帳號（名字旁是灰色盾牌），這是正常的。一個群只能有一個官方帳號，群裡已有其他機器人要先移出。
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          {step(2)}
          <span>群記進群後會貼一則告知和<strong>認領連結</strong>。你點連結、用 LINE 登入，這個群就歸到你的公司。認領前群記不會記錄任何內容。</span>
        </li>
        <li className="flex gap-3">
          {step(3)}
          <span>照常在群裡講話。整理出的行程、待辦、公告會先進「收件匣」請你確認，確認過的才算數。</span>
        </li>
      </ol>
      <p className="mt-4 text-xs text-gray-500">
        已經有一段時間的聊天記錄？先{' '}
        <a className="text-emerald-700 underline" href={oh(slug, '/import')}>匯入 LINE 匯出的 txt</a>，
        近 30 天的內容會直接整理出來。
      </p>
    </div>
  );
}
