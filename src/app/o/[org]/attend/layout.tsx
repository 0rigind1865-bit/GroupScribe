import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { orgAdminAccess } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 考勤管理殼：org 管理權在此把關（middleware 只驗 gs_liff 簽章；成員資格查 org_members，
// 平台擁有者 gs_auth 視同 owner——見 org/orgs.ts）。無權一律 404，不洩漏 org 是否存在。
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

  const tabs: [string, string][] = [
    ['', '總覽'],
    ['/employees', '員工'],
    ['/locations', '地點'],
    ['/reviews', '審核'],
    ['/calendar', '月曆'],
    ['/rules', '規則'],
  ];
  const base = `/o/${slug}/attend`;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-2">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <strong className="tracking-wide">{access.org.name}｜考勤</strong>
          <nav className="flex gap-1 overflow-x-auto text-sm">
            {tabs.map(([p, label]) => (
              <a key={p} href={`${base}${p}`} className="rounded px-2.5 py-1 whitespace-nowrap text-gray-600 hover:bg-gray-100">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <div className="pb-10">{children}</div>
    </>
  );
}
