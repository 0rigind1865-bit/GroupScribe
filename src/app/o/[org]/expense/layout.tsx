import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { orgAdminAccess } from '@/org/orgs';
import { moduleGate } from '@/org/modules';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';

export const dynamic = 'force-dynamic';

// 報帳模組的內殼（X1）：比照 attend/layout.tsx——orgAdminAccess ＋ moduleGate ＋ 共用殼
export default async function ExpenseLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const access = await orgAdminAccess(slug);
  if (!access) notFound();
  await moduleGate(slug, 'expense');

  // 「收據」的徽章＝員工申請了、還沒核銷的筆數（同清單預設的「還沒核銷」）。
  // 沒貼 migration 030（沒 submitted_at 欄）時那句會失敗，退回全部算已申請，同 isSubmitted
  const open = () => getDb().from('expenses').select('id', { count: 'exact', head: true }).eq('org_id', access.org.id).is('reimbursed_at', null);
  const r = await open().not('submitted_at', 'is', null);
  const counts = { unreimbursed: (r.error ? (await open()).count : r.count) ?? 0 };

  return (
    <>
      <Suspense fallback={null}>
        <ShellHeader slug={slug} moduleId="expense" counts={counts} />
      </Suspense>
      <div className="nav-gap md:!pb-0 md:pl-58">{children}</div>
      <Suspense fallback={null}>
        <BottomNav moduleId="expense" counts={counts} />
      </Suspense>
    </>
  );
}
