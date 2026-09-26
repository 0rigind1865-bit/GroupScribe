import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Badge, PunchBadge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';

export const dynamic = 'force-dynamic';

// 補卡審核佇列（對等舊 getReviewRequest / approveReview / rejectReview）。
const fmt = (d: string) =>
  new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const { ok, err } = await searchParams;
  const db = getDb();

  const [{ data: pending }, { data: recent }] = await Promise.all([
    db
      .from('adjustment_requests')
      .select('id, type, requested_at, reason, created_at, employees(display_name, dept)')
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
  ]);

  type Row = { id: string; type: string; requested_at: string; reason?: string | null; created_at?: string; status?: string; reviewed_at?: string | null; employees: { display_name: string; dept?: string | null } | null };

  return (
    <main className="page">
      <h1 className="mb-5">補卡審核</h1>
      {ok === 'approved' && <Banner>已核准，打卡紀錄已生成 ✓</Banner>}
      {ok === 'rejected' && <Banner tone="neutral">已拒絕。</Banner>}
      {err && <Banner tone="err">操作失敗或申請已被處理，請重新整理。</Banner>}

      <section className="space-y-2">
        {((pending ?? []) as unknown as Row[]).map((r) => (
          // 設計稿：誰＋哪種卡 → 大字時間與原因 → 拒絕｜核准（核准較寬、靠拇指）
          <div key={r.id} className="card space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">{r.employees?.display_name ?? '—'}</span>
              <span className="flex-1 text-xs text-gray-500">{r.employees?.dept ?? ''}</span>
              <PunchBadge type={r.type as 'in' | 'out'} label={r.type === 'in' ? '補上班卡' : '補下班卡'} />
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-xl font-bold tabular-nums">{fmt(r.requested_at)}</span>
              {r.reason && <span className="text-xs text-gray-500">「{r.reason}」</span>}
            </div>
            <form action="/api/attend/review" method="post" className="flex gap-2">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={r.id} />
              <button className="btn-danger" name="action" value="reject">拒絕</button>
              <button className="btn-confirm flex-1" name="action" value="approve">核准</button>
            </form>
          </div>
        ))}
        {!(pending ?? []).length && <Empty title="沒有待審核的補卡申請" hint="員工在打卡端送出補卡後，會出現在這裡等你核准。" />}
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
                  <Badge tone={r.status === 'approved' ? 'ok' : 'err'}>{r.status === 'approved' ? '已核准' : '已拒絕'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
