import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
import { scopedGroup } from '../group-scope';
import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { SetupNotice } from '../setup-notice';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';

export const dynamic = 'force-dynamic';

function fmt(d: string) {
  return new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

// 副檔名/類型標籤：路徑有副檔名就用（.jpg…）；LINE 存檔用訊息 ID 當檔名沒有副檔名，退回 kind
function extOf(a: { kind: string; storage_path: string }): string {
  const name = a.storage_path.split('/').pop() ?? '';
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  if (m) return `.${m[1].toLowerCase()}`;
  return a.kind === 'image' ? '圖片' : a.kind === 'pdf' ? 'PDF' : a.kind === 'audio' ? '語音' : '其他';
}

const SORTS: [string, string][] = [
  ['new', '最新'],
  ['old', '最舊'],
  ['type', '類型'],
  ['sender', '傳送者'],
  ['project', '專案'],
];

export default async function FilesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    group?: string;
    category?: string;
    ext?: string;
    project?: string;
    sort?: string;
    classified?: string;
    ctotal?: string;
    cerror?: string;
  }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await routeParams;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const params = await searchParams;
  const db = getDb();

  const { data: groupRows } = await db
    .from('groups_view')
    .select('group_id, name')
    .eq('org_id', org.id)
    .order('last_at', { ascending: false });
  const groupOptions = (groupRows ?? []) as { group_id: string; name: string | null }[];
  const group = scopedGroup(`/o/${slug}/files`, params, groupOptions);
  const groupName = groupOptions.find((g) => g.group_id === group)?.name ?? group;

  let assets: any[] = [];
  const urlOf = new Map<string, string>();
  let projectReady = false; // migration 007 未跑時，專案功能整組隱藏、其餘照常
  if (group) {
    // media_assets 無 group_id，透過 messages inner join 過濾；量通常不大，一次撈完前端分類
    assets =
      (
        await db
          .from('media_assets')
          .select('id, kind, storage_path, vision_summary, category, status, messages!inner(group_id, sender_name, created_at)')
          .eq('messages.group_id', group)
          .order('created_at', { referencedTable: 'messages', ascending: false })
      ).data ?? [];
    // project 欄位另查：007 未跑只是這個查詢失敗，主清單不受影響
    const { data: projRows, error: projErr } = await db
      .from('media_assets')
      .select('id, project')
      .in('id', assets.map((a) => a.id)); // 只讀本群的（A3）
    if (!projErr) {
      projectReady = true;
      const projOf = new Map((projRows ?? []).map((r: any) => [r.id, r.project]));
      for (const a of assets) a.project = projOf.get(a.id) ?? null;
    }
    // 私有 bucket → 批次簽名 URL（1 小時）
    const paths = assets.map((a) => a.storage_path);
    if (paths.length) {
      const { data: signed } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.signedUrl) urlOf.set(s.path!, s.signedUrl);
    }
  }

  const categories = [...new Set(assets.map((a) => a.category).filter(Boolean))] as string[];
  const exts = [...new Set(assets.map(extOf))].sort();
  const projects = [...new Set(assets.map((a) => a.project ?? '未分類'))].sort() as string[];
  const unclassified = assets.filter((a) => !a.project).length;

  // 篩選（類型/內容/專案可疊加）
  let shown = assets;
  if (params.category) shown = shown.filter((a) => a.category === params.category);
  if (params.ext) shown = shown.filter((a) => extOf(a) === params.ext);
  if (params.project) shown = shown.filter((a) => (a.project ?? '未分類') === params.project);

  // 排序基準：時間（預設新→舊）/類型/傳送者/專案；分類型排序時以區段標題分組顯示
  const sort = SORTS.some(([k]) => k === params.sort) ? params.sort! : 'new';
  const time = (a: any) => new Date(a.messages.created_at).getTime();
  const keyOf = (a: any) =>
    sort === 'type' ? extOf(a) : sort === 'sender' ? (a.messages.sender_name ?? '—') : (a.project ?? '未分類');
  if (sort === 'old') shown = [...shown].sort((a, b) => time(a) - time(b));
  else if (sort !== 'new')
    shown = [...shown].sort((a, b) => keyOf(a).localeCompare(keyOf(b), 'zh-TW') || time(b) - time(a));
  const grouped =
    sort === 'new' || sort === 'old'
      ? null
      : shown.reduce((m: Map<string, any[]>, a) => {
          const k = keyOf(a);
          m.set(k, [...(m.get(k) ?? []), a]);
          return m;
        }, new Map<string, any[]>());

  const qs = (patch: Record<string, string | undefined>) => {
    const cur: Record<string, string | undefined> = {
      group,
      category: params.category,
      ext: params.ext,
      project: params.project,
      sort: sort === 'new' ? undefined : sort,
      ...patch,
    };
    return oh(slug, '/files', cur);
  };
  // 作用中的篩選：摺疊起來時 summary 仍要看得出「現在只看得到一部分檔案」
  const activeFilters = [
    params.ext,
    params.category,
    params.project,
    sort !== 'new' ? SORTS.find(([k]) => k === sort)?.[1] : undefined,
  ].filter(Boolean) as string[];

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 ${active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white'}`;

  const card = (a: any) => {
    const url = urlOf.get(a.storage_path);
    const m = a.messages as { sender_name: string | null; created_at: string };
    return (
      <div className="card relative space-y-1 p-2" key={a.id}>
        <span className="absolute top-3 left-3 z-10 rounded bg-white/90 p-0.5 shadow">
          <BatchBox id={a.id} />
        </span>
        {a.kind === 'image' && url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="mb-1 aspect-square w-full rounded-lg object-cover" />
          </a>
        ) : (
          <a
            href={url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-gray-400"
          >
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2h8l4 4v16H6z" />
              <path d="M14 2v4h4" />
              {a.kind === 'pdf' && <path d="M9 13h6M9 17h6" />}
              {a.kind === 'audio' && <path d="M9 11v4M12 9v8M15 12v2" />}
            </svg>
          </a>
        )}
        <div className="text-xs text-gray-500">
          {extOf(a)}｜{a.category ?? '未分類'}
          {a.status !== 'done' && '｜解析中'}
        </div>
        {projectReady && a.project && a.project !== '未分類' && (
          <div className="inline-block rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-bold text-sky-900">{a.project}</div>
        )}
        {a.vision_summary && <div className="line-clamp-2 text-xs">{a.vision_summary}</div>}
        <div className="mt-0.5 text-xs text-gray-400">
          {fmt(m.created_at)}｜{m.sender_name ?? '—'}
        </div>
      </div>
    );
  };
  const grid = (items: any[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{items.map(card)}</div>
  );

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl md:text-4xl">檔案</h1>
        {group && <span className="text-gray-500">{groupName}</span>}
      </div>

      {!group && <p className="text-gray-600">還沒有任何群組資料。</p>}

      {group && (
        <>
          {params.classified && (
            <p className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">
              <strong>✅ 分類完成：</strong>{params.ctotal} 個未分類檔案中，AI 判定出 {params.classified} 個的所屬專案
              （其餘存為「未分類」，之後不重複送 AI）。
            </p>
          )}
          {params.cerror === 'quota' && (
            <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
              分類失敗——AI 配額/花費上限用完（Gemini 429），到{' '}
              <a className="underline" href="https://ai.studio/spend" target="_blank" rel="noreferrer">
                ai.studio/spend
              </a>{' '}
              調整後再試。
            </p>
          )}
          {params.cerror === 'db' && (
            <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
              分類失敗——<code>media_assets.project</code> 欄位尚未建立，請在 Supabase SQL Editor 執行{' '}
              <code>supabase/migrations/007_media_project.sql</code>。
            </p>
          )}
          {params.cerror === '1' && (
            <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
              分類失敗（詳見伺服器 log：<code>docker logs groupscribe</code>）。
            </p>
          )}

          {/* 篩選收進摺疊區（principles.md 希克定律）：十七個 chip 原本吃掉整個首屏，
              第一個檔案要滑到第二屏才看得到。作用中的條件寫在 summary，收起也看得見。 */}
          <details className="mb-3">
            <summary className="cursor-pointer text-sm text-gray-500">
              篩選與排序
              {activeFilters.length > 0 && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">
                  {activeFilters.join('・')}
                </span>
              )}
            </summary>
            <div className="mt-2">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="w-14 text-gray-500">排序</span>
            {SORTS.filter(([k]) => k !== 'project' || projectReady).map(([k, label]) => (
              <a key={k} href={qs({ sort: k === 'new' ? undefined : k })} className={chip(sort === k)}>
                {label}
              </a>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="w-14 text-gray-500">類型</span>
            <a href={qs({ ext: undefined })} className={chip(!params.ext)}>
              全部（{assets.length}）
            </a>
            {exts.map((e) => (
              <a key={e} href={qs({ ext: e })} className={chip(params.ext === e)}>
                {e}（{assets.filter((a) => extOf(a) === e).length}）
              </a>
            ))}
          </div>
          {categories.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="w-14 text-gray-500">內容</span>
              <a href={qs({ category: undefined })} className={chip(!params.category)}>
                全部
              </a>
              {categories.map((c) => (
                <a key={c} href={qs({ category: c })} className={chip(params.category === c)}>
                  {c}
                </a>
              ))}
            </div>
          )}
          {projectReady && projects.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="w-14 text-gray-500">專案</span>
              <a href={qs({ project: undefined })} className={chip(!params.project)}>
                全部
              </a>
              {projects.map((p) => (
                <a key={p} href={qs({ project: p })} className={chip(params.project === p)}>
                  {p}
                </a>
              ))}
            </div>
          )}
            </div>
          </details>

          {assets.length > 0 && (
            <>
              <div className="mb-2 flex justify-end"><SelectMode /></div>
              <BatchBar
                kind="file"
                back={qs({})}
                actions={[]}
                projects={projectReady ? projects.filter((p) => p !== '未分類') : undefined}
              />
            </>
          )}

          {projectReady && unclassified > 0 && (
            <form action="/api/files/classify" method="post" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="group_id" value={group} />
              <button className="btn-primary">AI 依專案分類（{unclassified} 個未分類）</button>
              <span className="text-gray-500">用前後對話判斷檔案屬於哪個案子；會呼叫 AI（費用小）</span>
            </form>
          )}

          {shown.length ? (
            grouped ? (
              <div className="space-y-5">
                {[...grouped.entries()].map(([k, items]) => (
                  <section key={k}>
                    <h2 className="mb-2 text-sm font-bold text-gray-600">
                      {k}（{items.length}）
                    </h2>
                    {grid(items)}
                  </section>
                ))}
              </div>
            ) : (
              grid(shown)
            )
          ) : (
            <div className="card text-sm text-gray-500">
              <p className="mb-1 font-bold text-gray-700">沒有符合條件的檔案</p>
              <p>可以清掉上方的篩選條件；群組裡傳的圖片與 PDF 會自動收進這裡。</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
