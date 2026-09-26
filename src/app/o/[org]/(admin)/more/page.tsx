import { liffUrl } from '@/core/ingest';
import { requireModule } from '@/org/orgs';
import { MoreList } from '../../more-list';
import { GS_MODULE } from '../../routes';

export const dynamic = 'force-dynamic';

// 「更多」：低頻功能的手機入口——公告/檔案屬查閱型、匯入/設定屬管理雜務。
// 桌面 nav 已直列全部連結，此頁主要服務手機底部 Tab 的第五格。
// 項目來自路由表（../../routes.tsx 的 GS_MODULE），加一頁不必動這裡。
export default async function MorePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { org: slug } = await params;
  await requireModule(slug, 'gs');
  const { group } = await searchParams;
  const liff = liffUrl(); // 未設 LIFF_ID 時整塊不出現

  return (
    <MoreList
      slug={slug}
      module={GS_MODULE}
      ctx={{ group }}
      extra={
        /* 成員版入口：管理者應該隨時能看到員工看到什麼；這個連結也可以直接丟進群組 */
        liff ? (
          <a href={liff} target="_blank" rel="noreferrer" className="card flex items-center gap-4 hover:bg-gray-50">
            <svg viewBox="0 0 24 24" className="h-7 w-7 flex-none text-emerald-700" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="6" y="2" width="12" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
            <span>
              <span className="block font-bold">成員版入口</span>
              <span className="block text-sm text-gray-500">員工在 LINE 裡看到的畫面，也可直接分享給群組成員</span>
            </span>
            <span className="ml-auto text-gray-300">↗</span>
          </a>
        ) : null
      }
    />
  );
}
