import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { IdentityBar } from '@/app/ui/identity-bar';
import { AttendLiffBoot, LangMenu } from '../shell';
import { shellData } from '../shell-data';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { myExpenseIdentity } from '@/expense/mine';
import { orgCategoryItems } from '@/expense/categories';
import type { ExpenseItem } from '@/expense/types';
import { photoPathOf, rowToItem } from '@/expense/items';
import { ExpenseApp, type Tab } from './expense-app';

export const dynamic = 'force-dynamic';

// 我的報帳（Snaptab 全功能移植）：伺服器準備好資料（身分、分類、專案、我的紀錄、照片簽名網址），
// 畫面與互動在 expense-app.tsx。五語系只做最小版（分頁、頁標題、記一筆六個標籤，labels.ts），其餘仍是繁中。
const TABS: Tab[] = ['add', 'list', 'report', 'analytics'];

export default async function MyExpense({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const uid = await liffUser();
  // 開機畫面走員工端語系：越南籍員工第一眼不該是中文（審查 F44）
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;
  const me = await myExpenseIdentity();
  if (!me)
    return <main className="mx-auto max-w-md p-6 text-sm text-gray-600">{tt('EXP_NOT_ENABLED')}</main>;

  const [sp, sd] = await Promise.all([searchParams, shellData(uid)]);
  const tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'add';
  const db = getDb();
  const [categories, { data: mine, error }, { data: named }, { data: used }] = await Promise.all([
    orgCategoryItems(me.org_id),
    db.from('expenses').select('*, media_assets(storage_path)').eq('org_id', me.org_id).eq('line_user_id', me.line_user_id).order('spent_on', { ascending: false }).limit(1000),
    db.from('expense_projects').select('name').eq('org_id', me.org_id).order('created_at', { ascending: false }), // migration 027 前會失敗，當空的
    db.from('expenses').select('project').eq('org_id', me.org_id).neq('project', '').order('created_at', { ascending: false }).limit(2000),
  ]);
  const rows = (mine ?? []) as Record<string, any>[];

  // 照片：私有 bucket → 批次簽名 1 小時
  const paths = rows.map(photoPathOf).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path!, s.signedUrl]));
  const items: ExpenseItem[] = rows.map((r) => {
    const it = rowToItem(r, urlOf.get(photoPathOf(r) ?? '') ?? null);
    return { ...it, person: it.person || me.display_name };
  });
  // 能管這家公司報帳（管理側有同一家的報帳）才給「去管理端改分類」的連結
  const mySlug = sd.groups.me.find((s) => s.id === 'myexpense')?.slugs?.[0];
  const manageHref = mySlug && sd.groups.admin.some((o) => o.slug === mySlug && o.items.some((i) => i.id === 'expense')) ? `/o/${mySlug}/expense/categories` : undefined;
  const projects = [...new Set([...(named ?? []).map((p) => p.name as string), ...(used ?? []).map((p) => p.project as string)])];

  return (
    <ExpenseApp
      key={me.org_id}
      tab={tab}
      header={
        // 語言地球：個人側有身分列時在最右（T10 第 1 輪 high：這頁原本零顆，外籍員工被帶進來後無路可切）
        <IdentityBar
          groups={sd.groups}
          currentKey="myexpense"
          side="me"
          tt={tt}
          dot={sd.dot}
          closeHref={`/a/expense?tab=${tab}`}
          rightSlot={<LangMenu loc={loc} back={`/a/expense?tab=${tab}`} />}
        />
      }
      L={{
        tabAdd: tt('EXP_TAB_ADD'),
        tabList: tt('EXP_TAB_LIST'),
        tabExport: tt('EXP_TAB_EXPORT'),
        tabAnalytics: tt('EXP_TAB_ANALYTICS'),
        titleAdd: tt('EXP_TITLE_ADD'),
        titleList: tt('EXP_TITLE_LIST'),
        titleExport: tt('EXP_TITLE_EXPORT'),
        titleAnalytics: tt('EXP_TITLE_ANALYTICS'),
        amount: tt('EXP_AMOUNT'),
        photo: tt('EXP_PHOTO'),
        category: tt('EXP_CATEGORY'),
        project: tt('EXP_PROJECT'),
        pay: tt('EXP_PAY'),
        save: tt('EXP_SAVE'),
      }}
      canManage={me.canManage}
      manageHref={manageHref}
      categories={categories}
      projects={projects}
      items={error ? [] : items}
      hasNearby={!!process.env.GOOGLE_MAPS_API_KEY}
    />
  );
}
