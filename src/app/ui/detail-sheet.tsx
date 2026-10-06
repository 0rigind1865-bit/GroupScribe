import type { ReactNode } from 'react';

// 詳情抽屜（2026-10 設計畫布「待辦詳情」）：?task= / ?event= / ?note= 打開。
// 原本詳情卡接在長清單最下面，手機上點了「編輯」畫面毫無變化、要往下捲才找得到。
// 純伺服器渲染、零 JS：遮罩是一個連回原頁的 <a>，關閉＝少一個參數的網址。
// 外觀與鎖背景捲動沿用報帳抽屜的 .sheet-backdrop／.sheet-panel（globals.css）。
// data-no-swipe：FloatingNav 在整頁聽橫滑換分頁，抽屜開著時不該換。
export function DetailSheet({ closeHref, title, badge, children }: { closeHref: string; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6" data-no-swipe="">
      <a href={closeHref} aria-label="關閉" tabIndex={-1} className="absolute inset-0" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-panel card relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-b-[14px]"
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="section-title">{title}</h2>
          {badge}
          <a href={closeHref} className="btn btn-sm ml-auto">
            關閉
          </a>
        </div>
        {children}
      </section>
    </div>
  );
}

const fmt = (d: string) =>
  new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** 「AI 根據這句整理」：來源訊息用聊天泡泡呈現（頭像字、誰、幾點），取代「時間｜誰：內容」那種一行字 */
export function SourceQuotes({ messages, manual }: { messages: { sender_name?: string | null; sender_id?: string | null; text?: string | null; created_at: string }[]; manual?: boolean }) {
  return (
    <div className="mt-5">
      <h3 className="section-title mb-2">AI 根據這句整理</h3>
      {messages.length ? (
        <div className="space-y-2">
          {messages.map((m, i) => {
            const who = m.sender_name ?? m.sender_id ?? '—';
            return (
              <div key={i} className="flex gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-[13px] font-black text-emerald-900">{who.slice(0, 1)}</span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-600">
                    {who} · {fmt(m.created_at)}
                  </p>
                  <p className="text-[15px] leading-relaxed break-words">{m.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">{manual ? '手動建立' : '來源訊息已被收回或刪除'}</p>
      )}
    </div>
  );
}

/** 從把關頁或今天頁點進來時帶 ?from=：存檔、關閉都回原頁，不會被丟在別的清單。只收本公司的站內路徑 */
export function safeFrom(slug: string, from?: string): string | undefined {
  const base = `/o/${slug}`;
  return from && (from === base || from.startsWith(`${base}/`) || from.startsWith(`${base}?`)) ? from : undefined;
}
