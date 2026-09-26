import { MoreList } from '../../more-list';
import { EXPENSE_MODULE } from '../../routes';

export const dynamic = 'force-dynamic';

// 報帳的「更多」：分類設定＋手機上換身分的入口（頂欄的切換器只在桌面顯示）
export default async function ExpenseMorePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  return <MoreList slug={slug} module={EXPENSE_MODULE} />;
}
