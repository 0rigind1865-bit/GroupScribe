import { oh } from '@/org/href';

// 上手卡（商業計劃 A7／U1）：新公司第一次進後台，需要的是「接下來做什麼」，不是一句「還沒有資料」。
// 三種狀態，由今天頁決定傳什麼：
//   沒有任何群        → 三步清單，全部未完成，每步附完整做法（取代整頁內容）
//   有群但訊息還很少   → 同一份清單的精簡版：邀群、認領打勾；有訊息才把第三步打勾成「已收到 N 則，整理中」（放在內容上方）
//   其他              → 不顯示
// 「有沒有群」要看 groups 表而非 groups_view：未認領群不落地訊息，剛認領的群 0 則，
// groups_view 以 messages 為主表看不到它——之前用 groups_view 判斷，認領完還是一直看到三步卡。
// 只勾看得到證據的步驟（群已歸到公司＝邀了也認領了；有訊息＝開始整理了）——不畫 N/20 之類的進度條：
// 20 則只是「收卡」的門檻，不是使用者要努力達成的目標。
export const FEW_MESSAGES = 20;

// 一步：完成＝實心綠圈打勾（螢幕閱讀器唸 sr，預設「已完成」）；未完成＝描邊圈與序號
function Step({ n, done, sr = '已完成', children }: { n: number; done: boolean; sr?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? (
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-600 text-white">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M6 12l4 4 8-8" />
          </svg>
          <span className="sr-only">{sr}：</span>
        </span>
      ) : (
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-emerald-600 text-xs font-semibold text-emerald-700">
          {n}
        </span>
      )}
      <span className={done ? 'text-gray-500' : undefined}>{children}</span>
    </li>
  );
}

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
  // 何時收卡不變：有群且訊息夠多
  if (hasGroups && messageCount >= FEW_MESSAGES) return null;

  const id = botBasicId?.trim().replace(/^@/, '');
  const started = messageCount > 0;
  const inboxHint = '整理出的行程、待辦、公告會先進「收件匣」請你確認，確認過的才算數。';
  return (
    <div className={hasGroups ? 'card mb-4 text-sm' : 'card'}>
      <p className="mb-3 font-semibold">{hasGroups ? '開始使用' : '三步開始'}</p>
      <ol className="space-y-3 text-sm">
        <Step n={1} done={hasGroups}>
          {hasGroups ? (
            '群記已進你的 LINE 工作群'
          ) : (
            <>
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
            </>
          )}
        </Step>
        <Step n={2} done={hasGroups}>
          {hasGroups ? (
            '群組已認領，歸到你的公司'
          ) : (
            <>
              群記進群後會貼一則告知和<strong>認領連結</strong>。你點連結、用 LINE 登入，這個群就歸到你的公司。認領前群記不會記錄任何內容。
            </>
          )}
        </Step>
        {/* 第三步沒有「完成」：有訊息＝開始了，打勾但報讀「已開始」 */}
        <Step n={3} done={started} sr="已開始">
          {started ? (
            <>
              <span className="font-semibold text-gray-900">已收到 {messageCount} 則，整理中</span>
              <span className="mt-1 block text-gray-600">群裡照常講話就好。{inboxHint}</span>
            </>
          ) : (
            <>照常在群裡講話。{inboxHint}</>
          )}
        </Step>
      </ol>
      {!hasGroups && (
        <p className="mt-4 text-xs text-gray-500">
          已經有一段時間的聊天記錄？先{' '}
          <a className="text-emerald-700 underline" href={oh(slug, '/import')}>匯入 LINE 匯出的 txt</a>，
          近 30 天的內容會直接整理出來。
        </p>
      )}
    </div>
  );
}
