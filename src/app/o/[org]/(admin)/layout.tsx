import { Suspense, type ReactNode } from 'react';
import { getDb } from '@/db';
import { orgBySlug, orgGroups } from '@/org/orgs';
import { visibleModules } from '@/org/modules';
import { orgAiBudget } from '@/core/quota';
import { Banner } from '@/app/ui/banner';
import { notFound } from 'next/navigation';
import { GroupSwitcher, type GroupOption } from '@/app/ui/group-switcher';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';

export const dynamic = 'force-dynamic';

// 群組助理模組的內殼：頂欄（工作區切換器＋nav＋群組切換器）＋ 手機底部膠囊。
// 權限已由上一層 o/[org]/layout.tsx 把關；路由表在 ../routes.tsx。
//
// 群組清單依 org 過濾；?group= 指到別 org 的群組時 scopedGroup 會自動退回合法群組。
// 模組開關：org 層 layout 只驗「是不是成員」，這裡再驗「群組助理有沒有開給這個 org」。
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const access = await visibleModules(slug);
  if (!access?.modules.some((m) => m.id === 'gs')) notFound();

  const db = getDb();
  const groups = await orgGroups(org.id);
  const ids = groups.map((g) => g.group_id); // 跨群聚合一律綁本 org 的群（商業計劃 2.1 節 A3）
  const [ev, tk, nt] = await Promise.all([
    db.from('events').select('id', { count: 'exact', head: true }).in('group_id', ids).eq('needs_confirmation', true).neq('status', 'ignored'),
    db.from('tasks').select('id', { count: 'exact', head: true }).in('group_id', ids).eq('needs_confirmation', true).eq('status', 'open'),
    db.from('notes').select('id', { count: 'exact', head: true }).in('group_id', ids).eq('needs_confirmation', true).eq('status', 'active'),
  ]);
  const counts = { pending: (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0) };

  return (
    <>
      <Suspense fallback={null}>
        <ShellHeader
          slug={slug}
          moduleId="gs"
          counts={counts}
          context={<GroupSwitcher groups={groups as GroupOption[]} />}
        />
      </Suspense>
      <div className="nav-gap md:!pb-0">
        {/* 停權（A8）：每一頁都要看得到為什麼不再整理 */}
        {(await orgAiBudget(org.id)).suspended && (
          <div className="mx-auto max-w-3xl px-4 pt-4 md:px-5">
            <Banner tone="warn">此公司的服務已暫停：訊息照常保存，但 AI 整理、問答與讀圖都先停下。請聯絡群記恢復。</Banner>
          </div>
        )}
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNav moduleId="gs" counts={counts} />
      </Suspense>
    </>
  );
}
