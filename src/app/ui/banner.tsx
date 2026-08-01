import { TONE_BANNER, type Tone } from './tone';

// 操作結果橫幅。取代散在 16 個頁面的手刻 `mb-3 rounded bg-*-50 p-2 text-sm text-*`。
export function Banner({ tone = 'ok', children }: { tone?: Tone; children: React.ReactNode }) {
  return <p className={`mb-3 rounded p-2 text-sm ${TONE_BANNER[tone]}`}>{children}</p>;
}

export type FlashDict = Record<string, { tone: Tone; text: string }>;

/**
 * URL 參數 → 橫幅的固定模式：所有寫入端點都是 POST → redirect(`?ok=x` / `?err=y`)，
 * 頁面再把參數翻成訊息。這裡收口那段重複的三元式。
 * dict 的 key 直接是參數值（ok=approved → dict.approved）。
 */
export function Flash({ sp, dict }: { sp: { ok?: string; err?: string }; dict: FlashDict }) {
  const key = sp.ok ?? sp.err;
  if (!key) return null;
  const hit = dict[key];
  // 字典沒收錄的值仍要顯示（端點新增了訊息但頁面沒跟上時，不要靜默吞掉）
  if (!hit) return <Banner tone={sp.err ? 'err' : 'ok'}>{key}</Banner>;
  return <Banner tone={hit.tone}>{hit.text}</Banner>;
}
