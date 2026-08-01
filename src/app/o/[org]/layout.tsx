import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { dbConfigured } from '@/db';
import { visibleModules } from '@/org/modules';

export const dynamic = 'force-dynamic';

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
