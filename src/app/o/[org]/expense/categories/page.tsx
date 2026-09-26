import { notFound } from 'next/navigation';
import { dbConfigured } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { Flash } from '@/app/ui/banner';
import { orgCategories, MAX_CATEGORIES } from '@/expense/categories';
import { SetupNotice } from '../../(admin)/setup-notice';

export const dynamic = 'force-dynamic';

// 報帳分類（X2-4，Snaptab CategoryManager）：一行一個，順序＝顯示順序。
// 用一個多行輸入框而不是逐列增刪按鈕：增、刪、排序都是「改文字」，不用 JS 也不用拖曳。
export default async function ExpenseCategories({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const sp = await searchParams;
  const list = await orgCategories(org.id);
  return (
    <main className="mx-auto max-w-xl p-4 md:p-5">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">報帳分類</h1>
      <p className="mb-3 text-sm text-gray-500">
        一行一個，由上到下就是顯示順序，最多 {MAX_CATEGORIES} 個。AI 讀收據時會從這份清單挑；讀不出來的歸「雜支」（會自動保留）。
        改名不會改到已記的舊資料。
      </p>
      <Flash
        sp={sp}
        dict={{
          saved: { tone: 'ok', text: '已儲存' },
          nomig: { tone: 'err', text: '還不能自訂分類：請先在 Supabase SQL Editor 執行 supabase/migrations/023_expenses_v2.sql' },
        }}
      />
      <form action="/api/expense/categories" method="post" className="card space-y-3">
        <input type="hidden" name="org" value={slug} />
        <textarea className="input min-h-60 w-full font-mono" name="categories" defaultValue={list.join('\n')} />
        <div className="flex gap-2">
          <button className="btn-primary">儲存</button>
          <button className="btn" name="reset" value="1">
            恢復預設
          </button>
        </div>
      </form>
    </main>
  );
}
