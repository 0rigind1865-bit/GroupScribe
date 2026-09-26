import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
import { TaskCircle, TimeChip, realAssignee } from '@/app/ui/item-marker';
import { dbConfigured, getDb } from '@/db';
import { SetupNotice } from './setup-notice';
import { addDays } from '@/core/grid';
import { isOverdue, todayISO } from '@/core/date';
import { orgAiBudget } from '@/core/quota';
import { Banner } from '@/app/ui/banner';
import { OnboardingCard } from '@/app/ui/onboarding-card';

export const dynamic = 'force-dynamic';

// 「今天」（UI 提案的管理版主畫面）：統計數字列＋日期大字軌議程（跨群聚合）。
// 群組管理（分類/群組理解/刪除）已移到 /groups，此頁專心回答「今天要幹嘛」。

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
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
  searchParams: Promise<{ group?: string; q?: string; view?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { group: groupParam, q, view } = await searchParams;
  const timeline = view === 'timeline' || !!q; // 原始訊息表格降到深一層視圖（U2）；有搜尋詞時當然要顯示結果
  const db = getDb();

  const today = todayISO();
  const in7 = addDays(today, 7);
  // 群組清單先撈：?group= 不在本 org 就當沒帶（別家的 group id 貼進網址也查不到），
  // 沒帶則跨群聚合綁本 org 全部群（商業計劃 2.1 節 A3）
  const { data: groups } = await db.from('groups_view').select('group_id, name, message_count').eq('org_id', org.id).order('last_at', { ascending: false });
  // 上手卡（A7）要看「認領了幾個群」，groups_view 看不到剛認領、還沒訊息的群
  const { count: claimedCount } = await db
    .from('groups')
    .select('group_id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .is('left_at', null)
    .not('group_id', 'like', 'dm:%');
  const hasGroups = (claimedCount ?? 0) > 0 || !!groups?.length;
  const messageCount = (groups ?? []).reduce((n: number, g: any) => n + (g.message_count ?? 0), 0);
  const ids = (groups ?? []).map((g: any) => g.group_id as string);
  const group = groupParam && ids.includes(groupParam) ? groupParam : undefined;
  const only = (qb: any) => (group ? qb.eq('group_id', group) : qb.in('group_id', ids));

  const [{ data: upcoming }, { data: dueTasks }, ev, tk, nt] = await Promise.all([
    only(db.from('events').select('id, group_id, title, starts_at, start_time, location').neq('status', 'ignored'))
      .gte('starts_at', today).lte('starts_at', in7).order('starts_at').order('start_time', { nullsFirst: true }),
    only(db.from('tasks').select('id, group_id, title, due_at, assignee').eq('status', 'open'))
      .not('due_at', 'is', null).lte('due_at', in7).order('due_at'),
    only(db.from('events').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).neq('status', 'ignored')),
    only(db.from('tasks').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'open')),
    only(db.from('notes').select('id', { count: 'exact', head: true }).eq('needs_confirmation', true).eq('status', 'active')),
  ]);
  const pendingCount = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);
  const ai = await orgAiBudget(org.id);
  const aiExhausted = ai.cap !== null && ai.used >= ai.cap;

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
    db.from('media_assets').select('id, messages!inner(group_id)', { count: 'exact', head: true }).eq('status', 'pending')
      .in('messages.group_id', group ? [group] : ids), // media_assets 無 group_id，經 messages 反查
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
  if (group && timeline) {
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
    <main className="mx-auto max-w-3xl p-4 md:max-w-5xl md:p-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h1>今天</h1>
        <span className="text-sm text-gray-500">
          {monthOf(today)} 月 {dayNum(today)} 日 · {dayWeek(today)}
        </span>
      </div>
      {aiExhausted && (
        <Banner tone="err">
          本月 AI 額度已用完（{ai.used} / {ai.cap} 次）：訊息照常保存，但暫停自動整理。{' '}
          <a className="underline" href={oh(slug, '/upgrade')}>看方案</a>
        </Banner>
      )}

      {!hasGroups ? (
        <OnboardingCard slug={slug} botBasicId={process.env.LINE_BOT_BASIC_ID} hasGroups={false} messageCount={0} />
      ) : (
        <>
          <OnboardingCard slug={slug} botBasicId={process.env.LINE_BOT_BASIC_ID} hasGroups messageCount={messageCount} />
          {/* 「需要你處理」：管理者的主畫面該回答「有什麼要我介入」，而不是再列一次清單。
              四項全部是例外——正常運作時都是 0，整區消失，版面讓給日期軌。 */}
          {/* 手機：「需要你處理」在上、兩欄小卡；桌機：右欄固定，左欄是日期軌 */}
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
          {attention.length > 0 && (
            <section className="mb-5 md:order-2 md:mb-0">
              <h2 className="mb-2 section-title text-amber-700">需要你處理</h2>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                {attention.map((a) => {
                  // 逾期是唯一的「已經出事」，用紅；其餘是「等你動手」，白卡就好
                  const late = a.label === '已逾期';
                  return (
                    <a
                      key={a.label}
                      href={a.href}
                      className={`flex flex-col gap-0.5 rounded-xl border p-3.5 hover:opacity-80 md:flex-row md:items-center md:gap-4 ${
                        late ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <span
                        className={`text-3xl leading-none font-black tabular-nums md:w-10 md:text-center ${late ? 'text-red-700' : 'text-gray-900'}`}
                        style={{ fontFamily: 'var(--font-title)' }}
                      >
                        {a.n}
                      </span>
                      <span className="min-w-0 md:flex-1">
                        <span className={`block text-sm font-bold ${late ? 'text-red-700' : 'text-gray-900'}`}>{a.label}</span>
                        <span className="block text-xs text-gray-500">{a.hint}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* 日期大字軌：事件與待辦混排 */}
          <section className="md:order-1">
          <h2 className="mb-3 section-title">未來 7 天</h2>
          {days.length ? (
            <div className="space-y-3">
              {days.map((iso) => (
                <div key={iso} className="flex gap-3">
                  <div className="w-11 flex-none pt-0.5 text-center">
                    <div
                      className={`text-2xl leading-none font-black tabular-nums ${iso === today ? 'text-emerald-700' : ''}`}
                      style={{ fontFamily: 'var(--font-title)' }}
                    >
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
                        className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
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
          </section>
          </div>
        </>
      )}

      {/* 原始訊息是「證據」不是「訊號」（principles.md 規則二）：主畫面只留搜尋框與一個低調入口，
          表格降到 ?view=timeline。搜尋結果本身就是要看訊息，所以有 q 時直接顯示。 */}
      {group && (
        <form method="get" className="mt-8 mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="group" value={group} />
          <input className="input w-64" name="q" placeholder="搜尋這個群的原始訊息" defaultValue={q ?? ''} />
          <button className="btn">搜尋</button>
          {!timeline && (
            <a className="text-sm text-gray-500 underline" href={`/o/${slug}/?group=${encodeURIComponent(group)}&view=timeline`}>
              最近 100 則原始訊息 →
            </a>
          )}
        </form>
      )}
      {group && timeline && (
        <>
          <h2 className="mb-3 card-title">{q ? `搜尋「${q}」` : '原始訊息（最近 100 則）'}</h2>
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
