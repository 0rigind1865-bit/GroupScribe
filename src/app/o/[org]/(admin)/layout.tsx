import { Suspense, type ReactNode } from 'react';
import { getDb } from '@/db';
import { orgBySlug, orgGroups } from '@/org/orgs';
import { notFound } from 'next/navigation';
import { GroupSwitcher, type GroupOption } from '@/app/ui/group-switcher';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';
import { GS_MODULE } from '../routes';

export const dynamic = 'force-dynamic';

// 群組助理模組的內殼：頂欄（工作區切換器＋nav＋群組切換器）＋ 手機底部膠囊。
// 權限已由上一層 o/[org]/layout.tsx 把關；路由表在 ../routes.tsx。
//
// 群組清單依 org 過濾；?group= 指到別 org 的群組時 scopedGroup 會自動退回合法群組。
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

  const db = getDb();
  const [groups, ev, tk, nt] = await Promise.all([
    orgGroups(org.id),
    db.from('events').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).neq('status', 'ignored'),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'open'),
    db.from('notes').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'active'),
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
      <div className="nav-gap md:!pb-0">{children}</div>
      <Suspense fallback={null}>
        <BottomNav module={GS_MODULE} counts={counts} />
      </Suspense>
    </>
  );
}
