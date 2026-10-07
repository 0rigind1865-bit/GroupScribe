import { notFound } from 'next/navigation';
import { isPlatformOwner, requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { Banner } from '@/app/ui/banner';
import { SimpleMarkdown } from '@/app/ui/simple-markdown';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from '../setup-notice';

export const dynamic = 'force-dynamic';

// 群組管理（從「今天」頁移出）：清單點進去是單一群組設定（?group=，/api/group/* 存完也都回這裡）。
// 2026-10 設計畫布「單一群組設定」：每個欄位都有標題；刪除收到最下面的危險區、要打出群組名才刪（刪了救不回來）；
// 移到別家公司只有平台擁有者看得到。
function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
// 群組名放進 pattern 屬性要逐字比對：正規式的語法字元都跳脫（瀏覽器用 v 旗標編譯，其他字元不能亂跳脫）
const literal = (s: string) => s.replace(/[\^$\\.*+?()[\]{}|]/g, '\\$&');

export default async function GroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; profile_error?: string; save_error?: string; claimed?: string; delete_error?: string }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <SetupNotice />;
  const { group: groupParam, profile_error, save_error, claimed, delete_error } = await searchParams;
  const db = getDb();

  const { org } = await requireModule(slug, 'gs');
  if (!org) notFound();
  const { data: groups } = await db.from('groups_view').select('*').eq('org_id', org.id).order('last_at', { ascending: false });
  const g = (groups ?? []).find((x: any) => x.group_id === groupParam); // 不是本公司的群＝當沒帶，回清單

  // dbErr：讀群組理解就失敗了（migration 004 沒跑），跟存檔失敗回來的 profile_error=db 同一句
  const banners = (dbErr = false) => (
    <>
      {profile_error === 'quota' ? (
        <Banner tone="err">
          群組理解產生失敗——AI 配額/花費上限用完（Gemini 429）。到{' '}
          <a className="underline" href="https://ai.studio/spend" target="_blank" rel="noreferrer">ai.studio/spend</a>{' '}
          調整後再試。
        </Banner>
      ) : profile_error === 'db' || dbErr ? (
        <Banner tone="err">
          「群組理解」欄位尚未建立——請在 Supabase SQL Editor 執行 <code>supabase/migrations/004_group_profile.sql</code>。
        </Banner>
      ) : profile_error ? (
        <Banner tone="err">群組理解儲存/產生失敗（詳見伺服器 log：<code>docker logs groupscribe</code>）。</Banner>
      ) : null}
      {claimed && <Banner tone="ok">群組已歸入本組織，從現在開始記錄。</Banner>}
      {save_error && <Banner tone="err">儲存失敗（資料庫暫時性錯誤的可能性較大），請稍後再試。</Banner>}
      {delete_error && <Banner tone="err">打的群組名稱對不上，這次沒有刪除任何資料。</Banner>}
    </>
  );

  // ── 清單：依分類排，點一列進那個群的設定 ──
  if (!g) {
    const byCat = new Map<string, any[]>();
    for (const x of groups ?? []) {
      const c = (x.category as string | null) ?? '未分類';
      byCat.set(c, [...(byCat.get(c) ?? []), x]);
    }
    const platform = await isPlatformOwner();
    return (
      <main className="page">
        <h1 className="mb-5">群組</h1>
        {banners()}
        {platform && slug === 'unclaimed' && (
          <Banner tone="warn">這裡是「未認領」：bot 被邀進但還沒有公司認領的群。認領前不記錄任何訊息，7 天後自動退群。</Banner>
        )}
        {!groups?.length && (
          <div className="card text-sm text-gray-500">
            <p className="mb-1 font-bold text-gray-700">還沒有任何群組</p>
            {/* 未認領的群不能匯入（import 頁對它 404，T10 第 2 輪） */}
            {slug === 'unclaimed' ? (
              <p>目前沒有等待認領的群。</p>
            ) : (
              <p>
                把 bot 加進 LINE 群組，或到 <a className="text-emerald-700 underline" href={oh(slug, '/import')}>匯入聊天記錄</a>{' '}
                建立一個純匯入的群組。
              </p>
            )}
          </div>
        )}
        <div className="space-y-5">
          {[...byCat.entries()].map(([cat, gs]) => (
            <section key={cat}>
              <h2 className="section-title mb-2">{cat}</h2>
              <div className="card divide-y divide-gray-100 p-0">
                {gs.map((x: any) => (
                  <a key={x.group_id} href={oh(slug, '/groups', { group: x.group_id })} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    {x.picture_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.picture_url} alt="" className="h-10 w-10 flex-none rounded-full" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{x.name ?? x.group_id}</span>
                      <span className="block text-xs text-gray-600">
                        {x.left_at ? 'bot 已離開 · ' : ''}
                        {x.message_count} 則 · 最後活動 {fmt(x.last_at)}
                      </span>
                    </span>
                    <span className="text-gray-400" aria-hidden>
                      ›
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    );
  }

  // ── 單一群組設定 ──
  const name: string = g.name ?? g.group_id;
  const [{ data: prof, error: profErr }, platform] = await Promise.all([
    db.from('groups').select('profile, profile_updated_at').eq('group_id', g.group_id).maybeSingle(),
    isPlatformOwner(),
  ]);
  if (profErr) console.error('讀取群組理解失敗（migration 004 跑了嗎？）', profErr);
  // 平台擁有者才有「移轉」：把群搬到任一 org（A5 歸戶介面；客戶自己走群內的認領連結）
  const allOrgs = platform ? ((await db.from('orgs').select('slug, name').order('name')).data ?? []) : [];
  const categories = [...new Set((groups ?? []).map((x: any) => x.category).filter(Boolean))] as string[];

  return (
    <main className="page">
      <a href={oh(slug, '/groups')} className="-ml-1 inline-flex min-h-11 items-center gap-0.5 text-[15px] font-bold">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        群組
      </a>
      <h1 className="break-words">{name}</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-600">
        <span className={`h-2 w-2 flex-none rounded-full ${g.left_at ? 'border-2 border-gray-400' : 'bg-emerald-500'}`} />
        {g.left_at ? 'bot 已離開' : '群記在群裡'} · {g.message_count} 則 · 最後活動 {fmt(g.last_at)}
      </p>
      <a href={oh(slug, '', { group: g.group_id })} className="inline-flex min-h-11 items-center text-sm font-bold text-emerald-700">
        看這個群的今天 →
      </a>

      <div className="mt-2 space-y-3.5">
        {banners(!!profErr)}
        <form action="/api/group/update" method="post" className="card flex flex-col gap-2">
          <input type="hidden" name="group_id" value={g.group_id} />
          <label htmlFor="cat" className="label">
            分類
          </label>
          <input id="cat" className="input" name="category" list="cats" defaultValue={g.category ?? ''} placeholder="例如：工地、客戶" />
          <datalist id="cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="text-[13px] text-gray-600">把群組分堆用，例如「工地」「客戶」。群組清單會照分類排。</span>
          <button className="btn-primary mt-1 self-start">儲存</button>
        </form>

        <section className="card flex flex-col gap-2">
          <h2 className="card-title">群記對這個群的了解</h2>
          <p className="text-[13px] leading-relaxed text-gray-600">
            群記讀過這個群的對話，記下在做什麼、常講的詞。這讓它整理得更準。
            {prof?.profile_updated_at && ` 更新於 ${fmt(prof.profile_updated_at)}。`}
          </p>
          {/* AI 寫的是 markdown 條列：照粗體與條列呈現，不讓「- **產業與業務**」的符號露在畫面上 */}
          <div className="space-y-1.5 rounded-[10px] bg-gray-50 p-3 text-sm leading-relaxed break-words text-gray-700">
            {prof?.profile ? <SimpleMarkdown text={prof.profile} /> : '還沒有。匯入聊天記錄、抽取完成後會自動產生，也可以按「讓群記重讀一次」。'}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* 修改：零 JS 的展開（details），展開後是可改的全文 */}
            <details className="group w-full">
              <summary className="btn inline-flex list-none group-open:hidden [&::-webkit-details-marker]:hidden">修改</summary>
              <form action="/api/group/update" method="post" className="space-y-2">
                <input type="hidden" name="group_id" value={g.group_id} />
                <textarea
                  className="input block w-full text-sm"
                  name="profile"
                  rows={8}
                  defaultValue={prof?.profile ?? ''}
                  placeholder="AI 從此群紀錄歸納的背景，會注入抽取與回答的 prompt；可手動修正補充"
                />
                <button className="btn-primary">儲存</button>
              </form>
            </details>
            <form action="/api/profile" method="post">
              <input type="hidden" name="group_id" value={g.group_id} />
              <button className="btn">讓群記重讀一次</button>
            </form>
          </div>
        </section>

        <section aria-label="危險區" className="flex flex-col gap-3.5 rounded-[14px] border border-red-200 bg-red-50 p-4">
          <h2 className="section-title text-red-700">危險區</h2>
          {platform && (
            <>
              <form action="/api/group/claim" method="post" className="flex flex-col gap-1.5">
                <input type="hidden" name="group_id" value={g.group_id} />
                <input type="hidden" name="back" value={oh(slug, '/groups')} />
                <span className="text-[15px] font-bold">移到別家公司</span>
                <span className="text-[13px] text-gray-600">只有平台擁有者看得到這一項。</span>
                <div className="flex gap-2">
                  <select className="input min-w-0 flex-1" name="org" defaultValue={slug} aria-label="移到哪家公司">
                    {allOrgs.map((o: any) => (
                      <option key={o.slug} value={o.slug}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn">移過去</button>
                </div>
              </form>
              <div className="border-t border-red-200" />
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[15px] font-bold">刪除這個群的所有資料</span>
            <span className="text-[13px] leading-relaxed text-gray-600">
              訊息、行程、待辦、公告、檔案全部刪掉，刪了救不回來。按下後要打出群組名稱才會刪。
            </span>
            {/* 打出群組名才按得下去：pattern 不符時輸入框 :invalid，globals.css 的 data-ack-name 讓刪除鈕變灰；伺服端再比一次 */}
            <details className="group">
              <summary className="btn-danger inline-flex list-none group-open:hidden [&::-webkit-details-marker]:hidden">刪除…</summary>
              <form action="/api/group/delete" method="post" className="flex flex-col gap-2">
                <input type="hidden" name="group_id" value={g.group_id} />
                <label className="label" htmlFor="confirm-name">
                  打出「{name}」確認刪除
                </label>
                <input id="confirm-name" className="input" name="confirm_name" required pattern={literal(name)} autoComplete="off" data-ack-name="" />
                <button className="btn-danger self-start" data-requires-ack="">
                  永久刪除這個群的資料
                </button>
              </form>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
