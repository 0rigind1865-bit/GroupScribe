import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { orgAdminAccess } from '@/org/orgs';
import { visibleModules } from '@/org/modules';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';

export const dynamic = 'force-dynamic';

// 報帳模組的內殼（X1）：比照 attend/layout.tsx——orgAdminAccess ＋ 模組沒開就 404 ＋ 共用殼
export default async function ExpenseLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  if (!(await orgAdminAccess(slug))) notFound();
  if (!(await visibleModules(slug))?.modules.some((m) => m.id === 'expense')) notFound();
  return (
    <>
      <Suspense fallback={null}>
        <ShellHeader slug={slug} moduleId="expense" />
      </Suspense>
      <div className="nav-gap md:!pb-0">{children}</div>
      <Suspense fallback={null}>
        <BottomNav moduleId="expense" />
      </Suspense>
    </>
  );
}
