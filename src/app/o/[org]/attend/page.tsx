import { getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { notFound } from 'next/navigation';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import type { Employee } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 考勤總覽（對等舊 getAbnormalRecords 的管理視角）：本月全員異常 ＋ 待審計數。
// 授權在 layout 完成；此頁只讀。
export default async function AttendOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const db = getDb();

  const month = workDate(new Date()).slice(0, 7);
  const [{ data: emps }, { count: pendingReviews }, { count: pendingEmps }] = await Promise.all([
    db.from('employees').select('*').eq('org_id', org.id).eq('status', 'active').order('display_name'),
    db.from('adjustment_requests').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
    db.from('employees').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending'),
  ]);
  const employees = (emps ?? []) as Employee[];

  // 小團隊（<50 人）逐員查本月狀態即可；量大再改成單查 group by
  const abnormal = await Promise.all(
    employees.map(async (e) => {
      const { days } = await monthData(org.id, e.id, month);
      return { emp: e, days: days.filter((d) => d.abnormal) };
    }),
  );
  const withIssues = abnormal.filter((a) => a.days.length > 0);

  return (
    <main className="mx-auto max-w-4xl p-5">
      <h1 className="mb-4 text-2xl font-bold">考勤總覽（{month}）</h1>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <a href={`/o/${slug}/attend/reviews`} className="card text-center hover:bg-gray-50">
          <span className={`block text-2xl font-bold ${pendingReviews ? 'text-amber-600' : ''}`}>{pendingReviews ?? 0}</span>
          <span className="text-xs text-gray-500">待審補卡</span>
        </a>
        <a href={`/o/${slug}/attend/employees`} className="card text-center hover:bg-gray-50">
          <span className={`block text-2xl font-bold ${pendingEmps ? 'text-amber-600' : ''}`}>{pendingEmps ?? 0}</span>
          <span className="text-xs text-gray-500">待啟用員工</span>
        </a>
        <div className="card text-center">
          <span className="block text-2xl font-bold">{employees.length}</span>
          <span className="text-xs text-gray-500">在職員工</span>
        </div>
        <div className="card text-center">
          <span className={`block text-2xl font-bold ${withIssues.length ? 'text-red-600' : ''}`}>{withIssues.length}</span>
          <span className="text-xs text-gray-500">本月有異常的員工</span>
        </div>
      </div>

      {withIssues.length ? (
        <section className="space-y-3">
          {withIssues.map(({ emp, days }) => (
            <div key={emp.id} className="card">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-bold">{emp.display_name}</span>
                <span className="text-xs text-gray-500">{emp.dept ?? ''}</span>
                <a className="ml-auto text-sm text-emerald-700 underline" href={`/o/${slug}/attend/calendar?emp=${emp.id}`}>
                  月曆 →
                </a>
              </div>
              <ul className="flex flex-wrap gap-2 text-xs">
                {days.map((d) => (
                  <li key={d.date} className="rounded bg-red-50 px-2 py-0.5 text-red-700">
                    {d.date}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-gray-500">本月目前沒有異常打卡。</p>
      )}
    </main>
  );
}
