import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
import { TaskCircle, TimeChip, realAssignee } from '@/app/item-marker';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from './setup-notice';
import { addDays } from '@/core/grid';
import { isOverdue, todayISO } from '@/core/date';

export const dynamic = 'force-dynamic';

// 「今天」（UI 提案的管理版主畫面）：統計數字列＋日期大字軌議程（跨群聚合）。
// 群組管理（分類/群組理解/刪除）已移到 /groups，此頁專心回答「今天要幹嘛」。

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}
const dayNum = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDate();
const dayWeek = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('zh-TW', { timeZone: 'UTC', weekday: 'short' });
const monthOf = (iso: string) => Number(iso.slice(5, 7));

// time 從 meta 拆出來單獨存：行程的左側視覺錨點是「幾點」，待辦的是「可勾的圈」。
// 形態自己說明類型，顏色退為輔助（原本兩者只差一條 4px 色線，得背對照表才知道誰是誰）。
type Row = {
  kind: 'event' | 'task';
  id: string;
  group_id: string;
  title: string;
  meta: string;
  overdue?: boolean;
  time?: string | null;
};

export default async function Today({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; q?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { group, q } = await searchParams;
  const db = getDb();

  const today = todayISO();
  const in7 = addDays(today, 7);
  const only = (qb: any) => (group ? qb.eq('group_id', group) : qb);

  const [{ data: groups }, { data: upcoming }, { data: dueTasks }, ev, tk, nt] = await Promise.all([
    db.from('groups_view').select('group_id, name').eq('org_id', org.id).order('last_at', { ascending: false }),
    only(db.from('events').select('id, group_id, title, starts_at, start_time, location').neq('status', 'ignored'))
      .gte('starts_at', today).lte('starts_at', in7).order('starts_at').order('start_time', { nullsFirst: true }),
    only(db.from('tasks').select('id, group_id, title, due_at, assignee').eq('status', 'open'))
      .not('due_at', 'is', null).lte('due_at', in7).order('due_at'),
    only(db.from('events').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).neq('status', 'ignored')),
    only(db.from('tasks').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'open')),
    only(db.from('notes').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'active')),
  ]);
  const pendingCount = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);

  // 管理者的主畫面該回答「有什麼需要我介入」，不是再列一次清單——清單日期軌已經給了。
  // 這四個都是「例外」：正常運作時全部為 0，整列消失（principles.md：空的時候讓版面給內容）。
  const [odq, unassigned, media] = await Promise.all([
    only(db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'))
      .not('due_at', 'is', null)
      .lt('due_at', today),
    // 無人認領：AI 抽到待辦卻沒抽到負責人（含它常填的「未定/待定/無」）
    only(db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open')).or(
      'assignee.is.null,assignee.eq.,assignee.eq.未定,assignee.eq.待定,assignee.eq.無',
    ),
    db.from('media_assets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const attention: { n: number; label: string; href: string; hint: string }[] = [
    { n: pendingCount, label: '待你確認', href: oh(slug, '/inbox'), hint: 'AI 整理的內容等你把關' },
    { n: odq.count ?? 0, label: '已逾期', href: oh(slug, '/tasks'), hint: '過了期限還沒完成' },
    { n: unassigned.count ?? 0, label: '沒有負責人', href: oh(slug, '/tasks'), hint: '沒指定人就不會有人做' },
    { n: media.count ?? 0, label: '檔案未解析', href: oh(slug, '/settings'), hint: 'AI 讀不到內容，也進不了抽取' },
  ].filter((a) => a.n > 0);
  const nameOf = new Map((groups ?? []).map((g: any) => [g.group_id, g.name ?? g.group_id]));

  // 事件與待辦混排進同一條日期軌（逾期待辦歸到今天，最上方）
  const byDay = new Map<string, Row[]>();
  const push = (iso: string, r: Row) => byDay.set(iso, [...(byDay.get(iso) ?? []), r]);
  for (const e of upcoming ?? [])
    push(e.starts_at, {
      kind: 'event',
      id: e.id,
      group_id: e.group_id,
      title: e.title,
      time: e.start_time ? String(e.start_time).slice(0, 5) : null,
      meta: e.location ?? '',
    });
  for (const t of dueTasks ?? []) {
    const late = isOverdue(t.due_at, today); // 與待辦頁同一套判斷（principles.md：一致性）
    push(late ? today : t.due_at, {
      kind: 'task',
      id: t.id,
      group_id: t.group_id,
      title: t.title,
      // 不再寫「到期待辦」——左邊那個可勾的圈已經說了它是待辦（形態優先於文字標籤）
      meta: [late ? `逾期 ${t.due_at.slice(5).replace('-', '/')}` : null, realAssignee(t.assignee)]
        .filter(Boolean)
        .join(' · '),
      overdue: late,
    });
  }
  const days = [...byDay.keys()].sort();

  let messages: any[] = [];
  if (group) {
    let query = db
      .from('messages')
      .select('id, sender_id, sender_name, type, text, created_at, is_low_info, media_assets(vision_summary, category, status)')
      .eq('group_id', group)
      .order('created_at', { ascending: false })
      .limit(100);
    if (q) query = query.ilike('text', `%${q}%`);
    messages = (await query).data ?? [];
  }

  // 勾完回到原本這一頁（含群組篩選），不要把人丟回全部群組
  const backHere = group ? `/o/${slug}/?group=${encodeURIComponent(group)}` : `/o/${slug}`;

  const href = (r: Row) =>
    r.kind === 'event'
      ? oh(slug, '/calendar', {
          group: r.group_id,
          view: 'day',
          date: [...byDay.entries()].find(([, rs]) => rs.includes(r))?.[0] ?? today,
        })
      : oh(slug, '/tasks', { group: r.group_id, task: r.id });

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-5">
      <h1 className="mb-3 text-2xl font-bold">今天</h1>

      {!groups?.length ? (
        <div className="card text-sm text-gray-500">
          <p className="mb-1 font-bold text-gray-700">還沒有任何資料</p>
          <p>
            把 bot 加進 LINE 群組，或到{' '}
            <a className="text-emerald-700 underline" href={`/o/${slug}/import`}>匯入聊天記錄</a> 上傳既有的 txt。
          </p>
        </div>
      ) : (
        <>
          {/* 「需要你處理」：管理者的主畫面該回答「有什麼要我介入」，而不是再列一次清單。
              四項全部是例外——正常運作時都是 0，整區消失，版面讓給日期軌。 */}
          {attention.length > 0 && (
            <section className="mb-4 space-y-1.5">
              <h2 className="text-xs font-bold tracking-widest text-amber-700">需要你處理</h2>
              {attention.map((a) => (
                <a
                  key={a.label}
                  href={a.href}
                  className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hover:bg-amber-100"
                >
                  <span className="w-8 flex-none text-center text-xl leading-none font-extrabold tabular-nums text-amber-900">
                    {a.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-amber-900">{a.label}</span>
                    <span className="block text-xs text-amber-700">{a.hint}</span>
                  </span>
                  <span className="flex-none text-amber-700">›</span>
                </a>
              ))}
            </section>
          )}

          {/* 日期大字軌：事件與待辦混排 */}
          {days.length ? (
            <div className="space-y-3">
              {days.map((iso) => (
                <div key={iso} className="flex gap-3">
                  <div className="w-11 flex-none pt-0.5 text-center">
                    <div className={`text-2xl leading-none font-extrabold tabular-nums ${iso === today ? 'text-emerald-700' : ''}`}>
                      {dayNum(iso)}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {iso === today ? '今天' : dayWeek(iso)}
                    </div>
                    {monthOf(iso) !== monthOf(today) && <div className="text-[10px] text-gray-400">{monthOf(iso)} 月</div>}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {byDay.get(iso)!.map((r) => (
                      <div
                        key={`${r.kind}-${r.id}`}
                        className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm"
                      >
                        {r.kind === 'task' ? (
                          <TaskCircle formAction="/api/tasks/update" id={r.id} back={backHere} title={r.title} overdue={r.overdue} />
                        ) : (
                          <TimeChip time={r.time} />
                        )}
                        <a href={href(r)} className="min-w-0 flex-1 hover:opacity-70">
                          <p className="text-sm font-bold">
                            {r.title}
                            {!group && (
                              <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                                {nameOf.get(r.group_id)}
                              </span>
                            )}
                          </p>
                          {r.meta && (
                            <p className={`text-xs ${r.overdue ? 'font-bold text-red-600' : 'text-gray-500'}`}>{r.meta}</p>
                          )}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-sm text-gray-500">
              <p className="mb-1 font-bold text-gray-700">未來 7 天沒有安排</p>
              <p>
                群組有新對話時，AI 會自動整理出行程與待辦。也可以到{' '}
                <a className="text-emerald-700 underline" href={`/o/${slug}/calendar`}>月曆</a> 看更遠的行程。
              </p>
            </div>
          )}
        </>
      )}

      {group && (
        <>
          <h2 className="mt-8 mb-3 text-xl font-bold">時間軸（最近 100 則）</h2>
          <form method="get" className="mb-3 flex gap-2">
            <input type="hidden" name="group" value={group} />
            <input className="input w-64" name="q" placeholder="關鍵字搜尋" defaultValue={q ?? ''} />
            <button className="btn">搜尋</button>
          </form>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2 font-medium">時間</th>
                  <th className="px-3 py-2 font-medium">發送者</th>
                  <th className="px-3 py-2 font-medium">內容</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className={`border-b border-gray-100 align-top ${m.is_low_info ? 'text-gray-400' : ''}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmt(m.created_at)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{m.sender_name ?? m.sender_id ?? '—'}</td>
                    <td className="px-3 py-1.5 whitespace-pre-wrap">
                      {m.text}
                      {m.media_assets?.map((a: any, i: number) => (
                        <div key={i} className="text-gray-600">
                          📎 {a.status === 'done' ? `${a.category ?? ''}｜${a.vision_summary ?? ''}` : '（解析中）'}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
