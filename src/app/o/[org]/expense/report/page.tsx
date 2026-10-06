import { redirect } from 'next/navigation';
import { oh } from '@/org/href';
import { requireModule } from '@/org/orgs';
import { isMonth } from '@/expense/query';

// 舊網址：「加總」已併進「統計」（2026-10 設計畫布）。書籤、舊連結轉過去，別 404。
// 舊頁沒選月份＝全部期間
export default async function ExpenseReport({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ project?: string; month?: string }>;
}) {
  const { org: slug } = await params;
  await requireModule(slug, 'expense');
  const sp = await searchParams;
  redirect(oh(slug, '/expense/stats', { project: sp.project, period: isMonth(sp.month) ? sp.month : 'all' }));
}
