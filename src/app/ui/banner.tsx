import { TONE_BANNER, TONE_BORDER, type Tone } from './tone';

// Alert（Component Gallery 名；別名 Banner / Notification / Callout）：操作結果橫幅。
// 行為：ok/neutral 是 role=status（禮貌播報），warn/err 是 role=alert（螢幕閱讀器立即唸出）。
// 形態採 Origin UI alert：淡底＋同色系細框、圓角 10。取代散在 16 個頁面的手刻橫幅。
export function Banner({ tone = 'ok', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'err' || tone === 'warn' ? 'alert' : 'status'}
      className={`mb-3 rounded-lg border px-3 py-2 text-sm ${TONE_BANNER[tone]} ${TONE_BORDER[tone]}`}
    >
      {children}
    </p>
  );
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
