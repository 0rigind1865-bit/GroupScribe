import { LiffInit } from '@/app/g/liff-init';
import { LOCALES, type Locale, type MsgKey } from '@/attend/i18n';
import type { Employee } from '@/attend/auth';

// 員工端的共用外框：頭部（返回 /g・姓名・語言）＋ 頂部 pill tab。
//
// 為什麼是頂部 pill 而不是全站的懸浮膠囊（FloatingNav）：
// 這一頁最高頻的動作是「打卡」那兩顆大按鈕，它們必須獨佔拇指區（費茨定律）。
// 底部再浮一條膠囊會跟主動作搶同一塊螢幕。架構對齊文輝考勤系統的三顆 pill。

type Tab = { key: 'dash' | 'records' | 'requests'; href: string; label: MsgKey };
const TABS: Tab[] = [
  { key: 'dash', href: '/a', label: 'TAB_DASHBOARD' },
  { key: 'records', href: '/a/records', label: 'TAB_RECORDS' },
  { key: 'requests', href: '/a/adjust', label: 'TAB_REQUESTS' },
];

export function AttendShell({
  emp,
  current,
  loc,
  tt,
  back,
  children,
}: {
  emp?: Pick<Employee, 'display_name' | 'dept' | 'picture_url'> | null;
  current: Tab['key'];
  loc: Locale;
  tt: (k: MsgKey, p?: Record<string, string | number>) => string;
  back: string; // 語言切換後回到哪一頁
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-3 flex items-center gap-2">
        {/* 返回群組助理：LIFF 深連結進來時 history 是空的，硬編碼路徑而非 back() */}
        <a
          href="/g"
          aria-label={tt('BACK_TO_GROUPS')}
          className="grid h-9 w-9 flex-none place-items-center rounded-full border border-gray-300 text-gray-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        {emp && (
          <>
            {emp.picture_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emp.picture_url} alt="" className="h-9 w-9 flex-none rounded-full" />
            ) : (
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {emp.display_name.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-bold">{emp.display_name}</span>
              {emp.dept && <span className="block text-[11px] text-gray-500">{emp.dept}</span>}
            </span>
          </>
        )}
        {/* 語言：details 折疊選單，零 JS、佔位小 */}
        <details className="relative ml-auto flex-none">
          <summary className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-gray-300 text-gray-600">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3c-2.5 2.7-2.5 15 0 18" />
            </svg>
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {LOCALES.map(([l, label]) => (
              <a
                key={l}
                href={`/api/attend/lang?to=${l}&back=${encodeURIComponent(back)}`}
                className={`block px-3 py-1.5 text-sm ${l === loc ? 'font-bold text-emerald-700' : 'text-gray-600'}`}
              >
                {label}
              </a>
            ))}
          </div>
        </details>
      </header>

      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={t.href}
            aria-current={t.key === current ? 'page' : undefined}
            className={`flex-1 rounded-full py-2 text-center text-sm font-bold ${
              t.key === current ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {tt(t.label)}
          </a>
        ))}
      </nav>

      {children}
    </main>
  );
}

/** 尚未取得 LINE 身分時的開機畫面（品牌與文案走員工端語系） */
export function AttendLiffBoot({ liffId, tt }: { liffId: string; tt: (k: MsgKey) => string }) {
  return (
    <LiffInit
      liffId={liffId}
      msgs={{
        brand: tt('APP_TITLE'),
        connecting: tt('LIFF_CONNECTING'),
        noId: tt('LIFF_NO_ID'),
        noIdentity: tt('LIFF_NO_IDENTITY'),
        authFailed: tt('LIFF_AUTH_FAILED'),
        sdkFailed: tt('LIFF_SDK_FAILED'),
        initFailed: tt('LIFF_INIT_FAILED'),
      }}
    />
  );
}
