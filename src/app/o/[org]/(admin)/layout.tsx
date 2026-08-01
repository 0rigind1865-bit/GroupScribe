import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { orgBySlug, orgGroups } from '@/org/orgs';
import { GroupSwitcher, type GroupOption } from '@/app/group-switcher';
import { BottomNav, TopNav } from './nav';

export const dynamic = 'force-dynamic';

// 全站唯一殼（UI 提案階段 B）：手機＝一行頂欄＋五格底部 Tab；桌面＝品牌＋nav（active 標記）＋切換器。
// 路由表在 nav.tsx；收件匣 badge 的待確認計數在此查一次供上下共用。
//
// 多租戶（migration 012）：本 route group 已搬入 /o/[org]/。v1 決策——
// GroupScribe 管理頁仍由 gs_auth（平台擁有者）把關（middleware），org 管理員（org_members）
// 的入口是 /o/[org]/attend 考勤模組；等第二個 GroupScribe 租戶出現再開放這裡的寫入權
// （既有 admin API 的 per-org 授權是獨立工程，比照 plan.md 的觸發條件紀律延後）。
// 群組清單依 org 過濾；?group= 指到別 org 的群組時 scopedGroup 會自動退回合法群組。
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  let groups: GroupOption[] = [];
  let pending = 0;
  if (dbConfigured()) {
    const org = await orgBySlug(slug);
    if (!org) notFound();
    const db = getDb();
    const [gs, ev, tk, nt] = await Promise.all([
      orgGroups(org.id),
      db.from('events').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).neq('status', 'ignored'),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'open'),
      db.from('notes').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'active'),
    ]);
    groups = gs as GroupOption[];
    pending = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);
  }

  return (
    <>
      {/* 手機：整條頂欄就是群組 context（品牌名讓位給「你正在看哪個群組」）；桌面：品牌＋nav＋切換器 */}
      {/* 釘在頂端：這條就是「你正在看哪個群組」的唯一線索，捲走了畫面上就沒有任何東西
          回答得了「這是哪一群」（principles.md：別讓我想） */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 md:gap-5 md:py-3">
        <strong className="hidden text-lg tracking-wide md:block">GroupScribe</strong>
        <Suspense fallback={null}>
          <TopNav pending={pending} />
        </Suspense>
        <div className="min-w-0 flex-1 md:ml-auto md:flex-none">
          <Suspense fallback={null}>
            <GroupSwitcher groups={groups} />
          </Suspense>
        </div>
      </header>
      {/* 手機懸浮膠囊佔位；桌機沒有底部 Tab，不留白 */}
      <div className="nav-gap md:!pb-0">{children}</div>
      <Suspense fallback={null}>
        <BottomNav pending={pending} />
      </Suspense>
    </>
  );
}
