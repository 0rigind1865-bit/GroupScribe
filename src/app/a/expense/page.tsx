import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { IdentityBar } from '@/app/ui/identity-bar';
import { AttendLiffBoot } from '../shell';
import { shellData } from '../shell-data';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { myExpenseIdentity } from '@/expense/mine';
import { orgCategoryItems } from '@/expense/categories';
import type { ExpenseItem } from '@/expense/types';
import { photoPathOf, rowToItem } from '@/expense/items';
import { ExpenseApp, type Tab } from './expense-app';

export const dynamic = 'force-dynamic';

// 我的報帳（Snaptab 全功能移植）：伺服器準備好資料（身分、分類、案場、我的紀錄、照片簽名網址），
// 畫面與互動在 expense-app.tsx。只有繁中（ponytail：外籍員工需要時接 attend/i18n）。
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
    return <main className="mx-auto max-w-md p-6 text-sm text-gray-600">你所屬的公司還沒開報帳功能，或你還不是在職員工。請聯絡管理者。</main>;

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
  const projects = [...new Set([...(named ?? []).map((p) => p.name as string), ...(used ?? []).map((p) => p.project as string)])];

  return (
    <ExpenseApp
      key={me.org_id}
      tab={tab}
      header={<IdentityBar groups={sd.groups} currentKey="myexpense" side="me" tt={tt} dot={sd.dot} />}
      canManage={me.canManage}
      categories={categories}
      projects={projects}
      items={error ? [] : items}
      hasNearby={!!process.env.GOOGLE_MAPS_API_KEY}
    />
  );
}
