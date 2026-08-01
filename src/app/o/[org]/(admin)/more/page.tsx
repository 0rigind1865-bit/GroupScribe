import { notFound } from 'next/navigation';
import { liffUrl } from '@/core/ingest';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
export const dynamic = 'force-dynamic';

// 「更多」（UI 提案階段 B）：低頻功能的手機入口——公告/檔案屬查閱型、匯入/設定屬管理雜務。
// 桌面 nav 已直列全部連結，此頁主要服務手機底部 Tab 的第五格。
// path 為模組內相對路徑，渲染時才用 oh() 補上 /o/<slug>（多租戶：絕不寫死絕對路徑）
const ENTRIES: { path: string; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    path: '/notes',
    title: '公告 / 決議',
    desc: '群組裡拍板的規則與宣布',
    icon: <path d="M4 4h16v12H8l-4 4z" />,
  },
  {
    path: '/files',
    title: '檔案',
    desc: '圖片與文件，依類型/專案分類',
    icon: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v4h4" />
      </>
    ),
  },
  {
    path: '/groups',
    title: '群組管理',
    desc: '分類、群組理解、刪除群組資料',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M16 11a3 3 0 100-6M18 20c0-2.5-1-4.6-2.5-5.6" />
      </>
    ),
  },
  {
    path: '/import',
    title: '匯入聊天記錄',
    desc: '貼上或上傳 txt，補歷史資料與提取',
    icon: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M4 21h16" />
      </>
    ),
  },
  {
    path: '/settings',
    title: '設定',
    desc: '進群告知訊息、AI 用量與預算',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
      </>
    ),
  },
];

export default async function MorePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { org: slug } = await params;
  if (!(await orgBySlug(slug))) notFound();
  const { group } = await searchParams;
  const liff = liffUrl(); // 未設 LIFF_ID 時整塊不出現
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-4 text-2xl font-bold">更多</h1>
      <div className="space-y-2">
        {ENTRIES.map((e) => (
          <a key={e.path} href={oh(slug, e.path, { group })} className="card flex items-center gap-4 hover:bg-gray-50">
            <svg viewBox="0 0 24 24" className="h-7 w-7 flex-none text-emerald-700" fill="none" stroke="currentColor" strokeWidth="1.6">
              {e.icon}
            </svg>
            <span>
              <span className="block font-bold">{e.title}</span>
              <span className="block text-sm text-gray-500">{e.desc}</span>
            </span>
            <span className="ml-auto text-gray-300">›</span>
          </a>
        ))}

        {/* 成員版入口：管理者應該隨時能看到員工看到什麼；這個連結也可以直接丟進群組 */}
        {liff && (
          <a
            href={liff}
            target="_blank"
            rel="noreferrer"
            className="card flex items-center gap-4 hover:bg-gray-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 flex-none text-emerald-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <rect x="6" y="2" width="12" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
            <span>
              <span className="block font-bold">成員版入口</span>
              <span className="block text-sm text-gray-500">員工在 LINE 裡看到的畫面，也可直接分享給群組成員</span>
            </span>
            <span className="ml-auto text-gray-300">↗</span>
          </a>
        )}
      </div>
    </main>
  );
}
