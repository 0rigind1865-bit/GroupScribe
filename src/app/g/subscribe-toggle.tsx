'use client';

import { useEffect, useState } from 'react';

// 每日摘要訂閱開關（計劃 B.8）。
// LINE 硬約束：1:1 推送要求對方已加 bot 好友，只是群成員不行。
// 用 liff.getFriendship() 先檢查——沒加好友就先引導，不然開了也收不到。
// getFriendship 需要 LINE Login channel 與官方帳號在 console 明確「連結」；
// 尚未連結時 API 會失敗，此時不擋使用者（讓他開，收不到再說），只是不顯示引導。
export function SubscribeToggle({
  groupId,
  back,
  enabled,
  error,
}: {
  groupId: string;
  back: string;
  enabled: boolean;
  error?: boolean;
}) {
  const [friend, setFriend] = useState<boolean | null>(null); // null = 還沒問到／問不到

  useEffect(() => {
    const w = window as any;
    if (!w.liff?.getFriendship) return;
    w.liff
      .getFriendship()
      .then((f: { friendFlag: boolean }) => setFriend(!!f.friendFlag))
      .catch(() => setFriend(null)); // channel 未連結等情況：不顯示引導、也不擋
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <form action="/api/liff/subscribe" method="post" className="flex items-center gap-2">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="enabled" value={enabled ? 'off' : 'on'} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">每天早上私訊我這個群的摘要</span>
          <span className="block text-[11px] text-gray-500">
            今日行程與到期待辦，沒事的日子不會打擾。只有你自己收得到，群組裡不會有任何訊息。
          </span>
        </span>
        <button
          className={`flex-none rounded-full px-3 py-1.5 text-xs font-bold ${
            enabled ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'
          }`}
        >
          {enabled ? '已開啟' : '開啟'}
        </button>
      </form>

      {enabled && friend === false && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          ⚠️ 還沒加我好友，LINE 不允許傳私訊給你。請回群組**點我的頭像 →「加入好友」**，摘要才收得到。
        </p>
      )}
      {error && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          設定失敗——管理者可能尚未執行 migration 009。
        </p>
      )}
    </div>
  );
}
