import { LiffInit } from '@/app/g/liff-init';
import { FloatingNav } from '@/app/ui/floating-nav';
import { SurfaceSwitcher } from '@/app/ui/surface-switcher';
import { LOCALES, type Locale, type MsgKey } from '@/attend/i18n';
import type { Employee } from '@/attend/auth';

// 員工端的共用外框：頭部（返回 /g・姓名・語言）＋ 底部懸浮膠囊。
//
// 導覽與管理端統一用 FloatingNav（滑動指示器／拖曳切換／捲動收合都是現成的），
// 全站只有一種「切分頁」的手勢。打卡的兩顆大按鈕仍在首屏，膠囊浮在其下方，
// 內容區用 nav-gap 讓開，兩者不重疊。

type TabKey = 'dash' | 'records' | 'requests';
type Tab = { key: TabKey; href: string; label: MsgKey; icon: React.ReactNode };
const TABS: Tab[] = [
  {
    key: 'dash',
    href: '/a',
    label: 'TAB_DASHBOARD',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    key: 'records',
    href: '/a/records',
    label: 'TAB_RECORDS',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M9 13h.01M14 13h.01M9 17h.01M14 17h.01" />
      </>
    ),
  },
  {
    key: 'requests',
    href: '/a/adjust',
    label: 'TAB_REQUESTS',
    icon: (
      <>
        <path d="M4 4h16v12H8l-4 4z" />
        <path d="M9 10h6" />
      </>
    ),
  },
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
      {/* 切換器取代原本的返回鍵：它已經包含「我的群組」，而且順帶回答
          「我還能去哪」——返回鍵只能回答「上一步」。 */}
      <div className="mb-2">
        <SurfaceSwitcher current="punch" />
      </div>

      <header className="mb-3 flex items-center gap-2">
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

      <div className="nav-gap">{children}</div>

      <FloatingNav
        tabs={TABS.map((t) => ({
          href: t.href,
          label: tt(t.label),
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
          ),
          active: t.key === current,
        }))}
      />
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
