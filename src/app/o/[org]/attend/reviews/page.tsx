import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';

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
  const org = await orgBySlug(slug);
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
    <main className="mx-auto max-w-4xl p-5">
      <h1 className="mb-4 text-2xl font-bold">補卡審核</h1>
      {ok === 'approved' && <p className="mb-3 rounded bg-emerald-50 p-2 text-sm text-emerald-800">已核准，打卡紀錄已生成 ✓</p>}
      {ok === 'rejected' && <p className="mb-3 rounded bg-gray-100 p-2 text-sm text-gray-700">已拒絕。</p>}
      {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">操作失敗或申請已被處理，請重新整理。</p>}

      <section className="space-y-2">
        {((pending ?? []) as unknown as Row[]).map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{r.employees?.display_name ?? '—'}</span>
            <span className="text-xs text-gray-500">{r.employees?.dept ?? ''}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${r.type === 'in' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {r.type === 'in' ? '補上班卡' : '補下班卡'}
            </span>
            <span>{fmt(r.requested_at)}</span>
            {r.reason && <span className="text-xs text-gray-500">「{r.reason}」</span>}
            <form action="/api/attend/review" method="post" className="ml-auto flex gap-2">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={r.id} />
              <button className="btn-confirm px-3 py-1" name="action" value="approve">核准</button>
              <button className="btn-danger px-3 py-1" name="action" value="reject">拒絕</button>
            </form>
          </div>
        ))}
        {!(pending ?? []).length && <p className="text-gray-500">沒有待審核的補卡申請。</p>}
      </section>

      {((recent ?? []) as unknown as Row[]).length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-gray-500">最近處理</h2>
          <ul className="space-y-1 text-sm text-gray-600">
            {((recent ?? []) as unknown as Row[]).map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span>{r.employees?.display_name ?? '—'}</span>
                <span className="text-xs">{r.type === 'in' ? '上班' : '下班'} {fmt(r.requested_at)}</span>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-bold ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                  {r.status === 'approved' ? '已核准' : '已拒絕'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
