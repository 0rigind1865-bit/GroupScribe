import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { orgAdminAccess } from '@/attend/auth';
import { moduleGate } from '@/org/modules';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';

export const dynamic = 'force-dynamic';

// 考勤模組的內殼。與群組助理走同一套殼（ShellHeader + FloatingNav），
// 原本是 6 個裸 <a>：無 active 標記、無 badge、手機得橫向捲動才看得到後面的分頁。
//
// 權限：上一層 o/[org]/layout.tsx 已擋掉非成員；這裡再驗一次 orgAdminAccess
// 是為了 attend 專屬的角色語意（平台擁有者 ∪ org_members），且成本是快取過的查詢。
export default async function AttendLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const access = await orgAdminAccess(slug);
  if (!access) notFound();
  const org = await orgBySlug(slug);
  if (!org) notFound();
  // 模組開關（migration 015）：考勤沒開給這個 org 就 404，與群組助理內殼對稱
  await moduleGate(slug, 'attend');

  const db = getDb();
  const [{ count: reviews }, { count: pendingEmps }] = await Promise.all([
    db.from('adjustment_requests').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
    db.from('employees').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
  ]);
  const counts = { reviews: reviews ?? 0, pendingEmps: pendingEmps ?? 0 };

  return (
    <>
      <Suspense fallback={null}>
        {/* 不放員工膠囊（手機、電腦都一樣，2026-10 設計畫布 AttendDesktop）：換人從「薪資」總表或「員工」清單點 */}
        <ShellHeader slug={slug} moduleId="attend" counts={counts} />
      </Suspense>
      <div className="nav-gap md:!pb-0 md:pl-58">{children}</div>
      <Suspense fallback={null}>
        <BottomNav moduleId="attend" counts={counts} />
      </Suspense>
    </>
  );
}
