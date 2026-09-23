import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from '../setup-notice';

export const dynamic = 'force-dynamic';

// 群組管理（從「今天」頁移出）：分類、群組理解、刪除——低頻管理雜務，從「更多」進入。
function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

export default async function GroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; profile_error?: string; save_error?: string }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <SetupNotice />;
  const { profile_error, save_error } = await searchParams;
  const db = getDb();

  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { data: groups } = await db.from('groups_view').select('*').eq('org_id', org.id).order('last_at', { ascending: false });
  const { data: profRows, error: profErr } = await db
    .from('groups')
    .select('group_id, profile, profile_updated_at')
    .in('group_id', (groups ?? []).map((g: any) => g.group_id)); // 只讀本 org 的（A3）
  if (profErr) console.error('讀取群組理解失敗（migration 004 跑了嗎？）', profErr);
  const profileOf = new Map((profRows ?? []).map((r: any) => [r.group_id, r]));

  const categories = [...new Set((groups ?? []).map((g: any) => g.category).filter(Boolean))] as string[];
  const byCat = new Map<string, any[]>();
  for (const g of groups ?? []) {
    const c = (g.category as string | null) ?? '未分類';
    byCat.set(c, [...(byCat.get(c) ?? []), g]);
  }

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-5">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">群組管理</h1>

      {profile_error === 'quota' ? (
        <p className="card mb-3 border-red-200 bg-red-50 text-sm text-red-700">
          群組理解產生失敗——AI 配額/花費上限用完（Gemini 429）。到{' '}
          <a className="underline" href="https://ai.studio/spend" target="_blank" rel="noreferrer">ai.studio/spend</a>{' '}
          調整後再試。
        </p>
      ) : profile_error === 'db' || profErr ? (
        <p className="card mb-3 border-red-200 bg-red-50 text-sm text-red-700">
          「群組理解」欄位尚未建立——請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/004_group_profile.sql</code>。
        </p>
      ) : profile_error ? (
        <p className="card mb-3 border-red-200 bg-red-50 text-sm text-red-700">
          群組理解儲存/產生失敗（詳見伺服器 log：<code>docker logs groupscribe</code>）。
        </p>
      ) : null}
      {save_error && (
        <p className="card mb-3 border-red-200 bg-red-50 text-sm text-red-700">
          儲存失敗（資料庫暫時性錯誤的可能性較大），請稍後再試。
        </p>
      )}

      {!groups?.length && (
        <div className="card text-sm text-gray-500">
          <p className="mb-1 font-bold text-gray-700">還沒有任何群組</p>
          <p>
            把 bot 加進 LINE 群組，或到 <a className="text-emerald-700 underline" href={`/o/${slug}/import`}>匯入聊天記錄</a>{' '}
            建立一個純匯入的群組。
          </p>
        </div>
      )}

      <datalist id="cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="space-y-5">
        {[...byCat.entries()].map(([cat, gs]) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-bold text-gray-500">{cat}</h2>
            <div className="space-y-2">
              {gs.map((g: any) => {
                const p = profileOf.get(g.group_id);
                return (
                  <div className="card flex flex-wrap items-center gap-3" key={g.group_id}>
                    {g.picture_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.picture_url} alt="" className="h-8 w-8 rounded-full" />
                    )}
                    <a className="font-semibold text-emerald-700 hover:underline" href={`/o/${slug}/?group=${encodeURIComponent(g.group_id)}`}>
                      {g.name ?? g.group_id}
                    </a>
                    {g.left_at && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">bot 已離開</span>}
                    <span className="text-sm text-gray-500">
                      {g.message_count} 則｜最後活動 {fmt(g.last_at)}
                    </span>
                    <form action="/api/group/update" method="post" className="ml-auto flex items-center gap-1 text-sm">
                      <input type="hidden" name="group_id" value={g.group_id} />
                      <input className="input w-28 py-1 text-xs" name="category" list="cats" defaultValue={g.category ?? ''} placeholder="分類" />
                      <button className="btn btn-sm">儲存</button>
                    </form>
                    <form action="/api/group/delete" method="post" className="flex items-center gap-2 text-sm">
                      <input type="hidden" name="group_id" value={g.group_id} />
                      <label className="flex items-center gap-1 text-gray-600">
                        <input type="checkbox" name="confirm" required /> 確認
                      </label>
                      <button className="btn-danger">刪除</button>
                    </form>
                    <details className="w-full">
                      <summary className="cursor-pointer text-sm text-gray-600">
                        群組理解（產業/術語/案子）
                        {p?.profile_updated_at ? ` — 更新於 ${fmt(p.profile_updated_at)}` : ' — 尚未產生（匯入頁抽取完成後自動產生）'}
                      </summary>
                      <form action="/api/group/update" method="post" className="mt-2 space-y-2">
                        <input type="hidden" name="group_id" value={g.group_id} />
                        <textarea
                          className="input block w-full font-mono text-xs"
                          name="profile"
                          rows={8}
                          defaultValue={p?.profile ?? ''}
                          placeholder="AI 從此群紀錄歸納的背景，會注入抽取與回答的 prompt；可手動修正補充"
                        />
                        <button className="btn btn-sm">儲存</button>
                      </form>
                      <form action="/api/profile" method="post" className="mt-1">
                        <input type="hidden" name="group_id" value={g.group_id} />
                        <button className="btn btn-sm">用 AI 重新產生（讀最近 300 則訊息）</button>
                      </form>
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
