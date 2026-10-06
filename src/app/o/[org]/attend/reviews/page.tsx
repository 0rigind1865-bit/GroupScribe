import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Badge, PunchBadge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { taipeiHm, workDate } from '@/attend/util';

export const dynamic = 'force-dynamic';

// 補卡審核佇列（對等舊 getReviewRequest / approveReview / rejectReview）。
// 2026-10 設計畫布「審核」：每張附上「那天原本的打卡紀錄」（不用另外去查月曆才敢核准）、可一次全部核准；按錯有「復原」。
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
/** 10/2（週五）18:05：台北日界，跟打卡紀錄同一套 */
const fmt = (d: string) => {
  const day = workDate(new Date(d));
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}（週${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]}）${taipeiHm(new Date(d))}`;
};

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string; n?: string; undo?: string | string[] }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const { ok, err, n, undo } = await searchParams;
  const db = getDb();
  // 剛審完的（?undo=id,id）→ 上方「已核准…」＋「復原」。只認本公司、現在還是已審狀態的（復原過就不再顯示）。
  // 網址被手打成 ?undo=a&undo=b 時 Next 給陣列：先接成一串
  const undoIds = (Array.isArray(undo) ? undo.join(',') : (undo ?? '')).split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  const [{ data: pending }, { data: recent }, { data: justDone }] = await Promise.all([
    db
      .from('adjustment_requests')
      .select('id, employee_id, type, requested_at, reason, created_at, employees(display_name, dept)')
      .eq('org_id', org.id)
      .eq('status', 'pending')
      .order('created_at'),
    db
      .from('adjustment_requests')
      .select('id, type, requested_at, status, reviewed_at, employees(display_name)')
      .eq('org_id', org.id)
      .neq('status', 'pending')
      .order('reviewed_at', { ascending: false })
      .limit(10),
    undoIds.length
      ? db.from('adjustment_requests').select('id, status, employees(display_name)').eq('org_id', org.id).neq('status', 'pending').in('id', undoIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const undone = (justDone ?? []) as { id: string; status: string; employees: { display_name: string } | null }[];
  const verb = undone[0]?.status === 'approved' ? '核准' : '退回';

  type Row = { id: string; employee_id?: string; type: string; requested_at: string; reason?: string | null; created_at?: string; status?: string; reviewed_at?: string | null; employees: { display_name: string; dept?: string | null } | null };
  const rows = (pending ?? []) as unknown as Row[];

  // 那天原本的打卡：一次撈齊（這幾位員工、這幾天），再按「人＋日」分給每張申請
  const dayOf = (r: Row) => workDate(new Date(r.requested_at));
  const { data: dayPunches } = rows.length
    ? await db
        .from('punch_records')
        .select('employee_id, work_date, type, punched_at, location_name')
        .eq('org_id', org.id)
        .in('employee_id', [...new Set(rows.map((r) => r.employee_id!))])
        .in('work_date', [...new Set(rows.map(dayOf))])
        .order('punched_at')
    : { data: [] as any[] };
  const contextOf = (r: Row) => {
    const ps = (dayPunches ?? []).filter((p: any) => p.employee_id === r.employee_id && p.work_date === dayOf(r));
    const has = (t: string) => ps.some((p: any) => p.type === t);
    const list = ps.map((p: any) => `${taipeiHm(new Date(p.punched_at))} ${p.type === 'in' ? '上班' : '下班'}${p.location_name ? `（${p.location_name}）` : ''}`);
    const lack = !has('in') && !has('out') ? '那天一張卡都沒有' : !has('in') ? '沒有上班卡' : !has('out') ? '沒有下班卡' : '';
    return [...list, lack].filter(Boolean).join('，');
  };

  return (
    <main className="page">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1>審核</h1>
        {rows.length > 1 && (
          <form action="/api/attend/review" method="post">
            <input type="hidden" name="org" value={slug} />
            {rows.map((r) => (
              <input key={r.id} type="hidden" name="id" value={r.id} />
            ))}
            <button className="btn btn-sm" name="action" value="approve">
              全部核准（{rows.length}）
            </button>
          </form>
        )}
      </div>
      <p className="mb-5 text-sm text-gray-600">員工送來的補卡。旁邊附上那天原本的打卡紀錄。</p>
      {/* 按錯可復原（principles.md：可逆性優先）。原生表單零 JS；手機上黏在頂端，往下審到一半也看得到 */}
      {undone.length > 0 ? (
        <div className="sticky top-2 z-20 mb-3 md:static">
          <Banner tone="neutral">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 break-words">
                {undone.length === 1 ? `已${verb}${undone[0].employees?.display_name ?? ''}的補卡` : `已${verb} ${undone.length} 筆補卡`}
              </span>
              <form action="/api/attend/review" method="post" className="flex-none">
                <input type="hidden" name="org" value={slug} />
                {undone.map((u) => (
                  <input key={u.id} type="hidden" name="id" value={u.id} />
                ))}
                <button className="btn" name="action" value="undo">
                  復原
                </button>
              </form>
            </div>
          </Banner>
        </div>
      ) : (
        <>
          {ok === 'approved' && <Banner>{Number(n) > 1 ? `已核准 ${n} 筆` : '已核准'}，打卡紀錄已生成 ✓</Banner>}
          {ok === 'rejected' && <Banner tone="neutral">已退回。</Banner>}
        </>
      )}
      {ok === 'undone' && <Banner tone="neutral">已復原，{Number(n) > 1 ? `${n} 筆補卡` : '這筆補卡'}回到等你審。</Banner>}
      {err && <Banner tone="err">操作失敗或申請已被處理，請重新整理。</Banner>}

      <section className="space-y-2">
        {rows.map((r) => (
          // 設計稿：誰＋哪種卡 → 大字時間 → 原因 → 那天原本的紀錄 → 退回｜核准（核准較寬、靠拇指）
          <div key={r.id} className="card space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-[13px] font-black text-emerald-900">
                {(r.employees?.display_name ?? '—').slice(-1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{r.employees?.display_name ?? '—'}</span>
                {r.employees?.dept && <span className="block text-xs text-gray-600">{r.employees.dept}</span>}
              </span>
              <PunchBadge type={r.type as 'in' | 'out'} label={r.type === 'in' ? '補上班卡' : '補下班卡'} />
            </div>
            <p className="text-[22px] font-bold tabular-nums">{fmt(r.requested_at)}</p>
            {r.reason && <p className="text-gray-700">原因：「{r.reason}」</p>}
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] leading-relaxed text-gray-700">
              <b className="text-gray-900">那天原本的紀錄</b>
              <br />
              {contextOf(r)}
            </p>
            <form action="/api/attend/review" method="post" className="grid grid-cols-[1fr_2fr] gap-2">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={r.id} />
              <button className="btn min-h-12 text-[15px]" name="action" value="reject">
                退回
              </button>
              <button className="btn-confirm min-h-12 text-[15px]" name="action" value="approve">
                核准
              </button>
            </form>
          </div>
        ))}
        {!rows.length && <Empty title="補卡都審完了" hint="員工送出補卡時，這裡和「審核」分頁會亮起來。" />}
      </section>

      {((recent ?? []) as unknown as Row[]).length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 section-title">最近處理</h2>
          <ul className="space-y-1 text-sm text-gray-600">
            {((recent ?? []) as unknown as Row[]).map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span>{r.employees?.display_name ?? '—'}</span>
                <span className="text-xs">{r.type === 'in' ? '上班' : '下班'} {fmt(r.requested_at)}</span>
                <span className="ml-auto">
                  <Badge tone={r.status === 'approved' ? 'ok' : 'err'}>{r.status === 'approved' ? '已核准' : '已退回'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
