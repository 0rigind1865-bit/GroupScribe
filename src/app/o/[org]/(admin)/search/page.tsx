import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from '../setup-notice';

export const dynamic = 'force-dynamic';

// 「找」（2026-10 設計畫布）：對話、檔案、公告一起搜。公告與檔案從「更多」搬來這裡當成篩選籤。
// 跨群（綁本公司的群，商業計劃 2.1 節 A3）；有 ?group 就只搜那一群。
// 原本的「搜尋這個群的原始訊息」只在選了群組的今天頁才出現，沒人知道它在。

const LIMIT = 20;
const KINDS = [
  { key: '', label: '全部' },
  { key: 'msg', label: '對話' },
  { key: 'file', label: '檔案' },
  { key: 'note', label: '公告 / 決議' },
] as const;

const fmt = (d: string) =>
  new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
// ilike 的 % _ \ 是萬用字元，使用者打的要當字面比對
const like = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;

function Hit({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-amber-200 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; q?: string; kind?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'gs');
  if (!org) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 50);
  const kind = KINDS.some((k) => k.key === sp.kind) ? (sp.kind ?? '') : '';
  const db = getDb();

  const { data: groupRows } = await db.from('groups_view').select('group_id, name').eq('org_id', org.id);
  const ids = (groupRows ?? []).map((g: any) => g.group_id as string);
  const nameOf = new Map((groupRows ?? []).map((g: any) => [g.group_id, g.name ?? g.group_id]));
  const group = sp.group && ids.includes(sp.group) ? sp.group : undefined;
  const scope = group ? [group] : ids;
  const want = (k: string) => !!q && scope.length > 0 && (!kind || kind === k);

  // 每一種各自查；檔案與公告比兩個欄位就查兩次再合併——不用 .or()，免得搜尋詞裡的逗號、括號被當成語法
  const none = Promise.resolve({ data: [] as any[] });
  const [msgs, filesA, filesB, notesA, notesB] = await Promise.all([
    want('msg')
      ? db.from('messages').select('id, group_id, sender_name, sender_id, text, created_at').in('group_id', scope).ilike('text', like(q)).order('created_at', { ascending: false }).limit(LIMIT)
      : none,
    want('file')
      ? db.from('media_assets').select('id, kind, vision_summary, category, messages!inner(group_id, sender_name, created_at)').in('messages.group_id', scope).ilike('vision_summary', like(q)).limit(LIMIT)
      : none,
    want('file')
      ? db.from('media_assets').select('id, kind, vision_summary, category, messages!inner(group_id, sender_name, created_at)').in('messages.group_id', scope).ilike('ocr_text', like(q)).limit(LIMIT)
      : none,
    want('note') ? db.from('notes').select('id, group_id, kind, title, body, created_at').in('group_id', scope).eq('status', 'active').ilike('title', like(q)).limit(LIMIT) : none,
    want('note') ? db.from('notes').select('id, group_id, kind, title, body, created_at').in('group_id', scope).eq('status', 'active').ilike('body', like(q)).limit(LIMIT) : none,
  ]);
  const uniq = (rows: any[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const messages = msgs.data ?? [];
  const files = uniq([...(filesA.data ?? []), ...(filesB.data ?? [])]).slice(0, LIMIT);
  const notes = uniq([...(notesA.data ?? []), ...(notesB.data ?? [])]).slice(0, LIMIT);
  const total = messages.length + files.length + notes.length;

  const tag = (gid: string) => !group && <span className="text-gray-500"> · {nameOf.get(gid) ?? gid}</span>;

  return (
    <main className="page">
      <h1 className="mb-4">找</h1>
      <form method="get" role="search" className="mb-3 flex gap-2">
        {group && <input type="hidden" name="group" value={group} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input className="input min-w-0 flex-1" type="search" name="q" defaultValue={q} placeholder="搜尋對話、檔案、公告…" aria-label="搜尋對話、檔案、公告" />
        <button className="btn-primary">搜尋</button>
      </form>
      <nav className="mb-6 flex gap-2 overflow-x-auto" aria-label="種類">
        {KINDS.map((k) => (
          <a
            key={k.key}
            href={oh(slug, '/search', { q, group, kind: k.key })}
            aria-current={kind === k.key ? 'page' : undefined}
            className={`flex min-h-10 flex-none items-center rounded-full border px-3.5 text-[13px] font-bold ${
              kind === k.key ? 'border-transparent bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'
            }`}
          >
            {k.label}
          </a>
        ))}
      </nav>

      {!q ? (
        <div className="space-y-2">
          {/* 還沒搜：公告與檔案原本在「更多」，現在從這裡直接看全部 */}
          <a href={oh(slug, '/notes', { group })} className="card flex items-center justify-between hover:bg-gray-50">
            <span className="card-title">看全部公告 / 決議</span>
            <span className="text-gray-400">›</span>
          </a>
          <a href={oh(slug, '/files', { group })} className="card flex items-center justify-between hover:bg-gray-50">
            <span className="card-title">看全部檔案</span>
            <span className="text-gray-400">›</span>
          </a>
          <p className="px-1 pt-3 text-sm leading-relaxed text-gray-600">也可以在 LINE 群組裡 @群記 直接問，它會說是誰、哪天講的。</p>
        </div>
      ) : total === 0 ? (
        <div className="card text-sm text-gray-600">
          <p className="mb-1 font-bold text-gray-900">找不到「{q}」</p>
          <p>換個說法試試，或在 LINE 群組裡 @群記 直接問。只搜得到群記進群之後的對話。</p>
        </div>
      ) : (
        <div className="space-y-6">
          {files.length > 0 && (
            <section>
              <h2 className="section-title mb-2">檔案 · {files.length}</h2>
              <div className="space-y-2">
                {files.map((f: any) => (
                  <a key={f.id} href={oh(slug, '/files', { group: f.messages.group_id })} className="card flex gap-3 hover:bg-gray-50">
                    <span className="grid h-14 w-11 flex-none place-items-center rounded-lg bg-gray-100 text-xs font-black text-gray-600 uppercase">{f.kind}</span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold">{f.category ?? '檔案'}</span>
                      <span className="block text-xs text-gray-500">
                        {f.messages.sender_name ?? '—'} · {fmt(f.messages.created_at)}
                        {tag(f.messages.group_id)}
                      </span>
                      {f.vision_summary && (
                        <span className="mt-1 line-clamp-2 block text-sm text-gray-700">
                          <Hit text={f.vision_summary} q={q} />
                        </span>
                      )}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {notes.length > 0 && (
            <section>
              <h2 className="section-title mb-2">公告 / 決議 · {notes.length}</h2>
              <div className="space-y-2">
                {notes.map((n: any) => (
                  <a key={n.id} href={oh(slug, '/notes', { group: n.group_id, note: n.id })} className="card block hover:bg-gray-50">
                    <span className="block text-[15px] font-bold">
                      <Hit text={n.title} q={q} />
                    </span>
                    <span className="block text-xs text-gray-500">
                      {n.kind === 'decision' ? '決議' : '公告'} · {fmt(n.created_at)}
                      {tag(n.group_id)}
                    </span>
                    {n.body && (
                      <span className="mt-1 line-clamp-2 block text-sm text-gray-700">
                        <Hit text={n.body} q={q} />
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}
          {messages.length > 0 && (
            <section>
              <h2 className="section-title mb-2">對話 · {messages.length}</h2>
              <div className="space-y-2">
                {messages.map((m: any) => (
                  <a key={m.id} href={oh(slug, '', { group: m.group_id, view: 'timeline', q })} className="card flex gap-3 hover:bg-gray-50">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-[13px] font-black text-emerald-900">
                      {(m.sender_name ?? '？').slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-500">
                        {m.sender_name ?? m.sender_id ?? '—'} · {fmt(m.created_at)}
                        {tag(m.group_id)}
                      </span>
                      <span className="mt-0.5 line-clamp-3 block text-[15px] whitespace-pre-wrap">
                        <Hit text={m.text ?? ''} q={q} />
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {[messages, files, notes].some((r) => r.length === LIMIT) && <p className="text-center text-sm text-gray-500">每一種最多列 {LIMIT} 筆，找不到的話把關鍵字打得更準一點。</p>}
        </div>
      )}
    </main>
  );
}
