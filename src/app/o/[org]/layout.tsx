import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { dbConfigured } from '@/db';
import { visibleModules } from '@/org/modules';
import { orgBySlug } from '@/org/orgs';

export const dynamic = 'force-dynamic';

// 瀏覽器分頁標題帶公司名：頂欄右邊的公司名拿掉後，同時開兩家的分頁要靠這個分（審查 F41）
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  if (!dbConfigured()) return {};
  const org = await orgBySlug((await params).org);
  return org ? { title: { default: org.name, template: `%s · ${org.name}` } } : {};
}

// org 層外殼：唯一的權限閘門。
//
// 兩個內殼（(admin)/layout.tsx、attend/layout.tsx）各自渲染完整頂欄——
// 它們才知道自己是哪個模組、badge 數字從哪來。這裡只負責「進不進得來」，
// 進來之後長什麼樣不歸這層管。
//
// notFound() 而非 redirect：org 不存在、與「存在但你沒權限」回同一個結果，
// 不洩漏哪個 org slug 是真的（比照 attend/layout.tsx 原有語意）。
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <>{children}</>; // 未設定 DB：由頁面顯示設定指引
  if (!(await visibleModules(slug))) notFound();
  return <>{children}</>;
}
