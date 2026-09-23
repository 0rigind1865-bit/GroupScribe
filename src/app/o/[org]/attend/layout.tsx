import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { orgAdminAccess } from '@/attend/auth';
import { visibleModules } from '@/org/modules';
import { ShellHeader } from '../shell-header';
import { BottomNav } from '../nav';
import { EmployeeSwitcher } from './employee-switcher';

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
  if (!(await visibleModules(slug))?.modules.some((m) => m.id === 'attend')) notFound();

  const db = getDb();
  const [{ count: reviews }, { count: pendingEmps }, { data: emps }] = await Promise.all([
    db.from('adjustment_requests').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
    db.from('employees').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
    db.from('employees').select('id, display_name, dept, status').eq('org_id', org.id).neq('status', 'pending').order('display_name'),
  ]);
  const counts = { reviews: reviews ?? 0, pendingEmps: pendingEmps ?? 0 };

  return (
    <>
      <Suspense fallback={null}>
        <ShellHeader
          slug={slug}
          moduleId="attend"
          counts={counts}
          context={<EmployeeSwitcher employees={(emps ?? []) as never} />}
        />
      </Suspense>
      <div className="nav-gap md:!pb-0">{children}</div>
      <Suspense fallback={null}>
        <BottomNav moduleId="attend" counts={counts} />
      </Suspense>
    </>
  );
}
