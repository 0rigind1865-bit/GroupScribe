import { notFound } from 'next/navigation';
import { dbConfigured } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { orgCategoryItems, MAX_CATEGORIES } from '@/expense/categories';
import { EXPENSE_CATEGORIES } from '@/expense/receipt';
import { defaultIconFor } from '@/expense/icon-names';
import { SetupNotice } from '../../(admin)/setup-notice';
import { ManageCategories } from './manage';

export const dynamic = 'force-dynamic';

// 報帳分類（X2-4／Snaptab 全功能移植）：名稱＋圖示、順序＝顯示順序。AI 讀收據、文字記帳、員工 App 的 AI 分類都從這份挑。
export default async function ExpenseCategories({ params }: { params: Promise<{ org: string }> }) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const items = await orgCategoryItems(org.id);
  return (
    <main className="page">
      <h1 className="mb-1">報帳分類</h1>
      <p className="mb-3 text-sm text-gray-500">
        最多 {MAX_CATEGORIES} 個。讀不出分類的歸「雜支」（會自動保留）。改名不會改到已記的舊資料。
      </p>
      <ManageCategories slug={slug} items={items} defaults={EXPENSE_CATEGORIES.map((name) => ({ name, icon: defaultIconFor(name) }))} />
    </main>
  );
}
