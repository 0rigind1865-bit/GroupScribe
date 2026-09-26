import { getDb } from '@/db';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { StatGrid } from '@/app/ui/stat';
import { Empty } from '@/app/ui/empty';
import { notFound } from 'next/navigation';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import type { Employee } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 考勤總覽（對等舊 getAbnormalRecords 的管理視角）：本月全員異常 ＋ 待審計數。
// 授權在 layout 完成；此頁只讀。
export default async function AttendOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
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
    <main className="page">
      <div className="mb-5 flex items-baseline gap-3">
        <h1>考勤總覽</h1>
        <span className="text-sm text-gray-500">{month}</span>
      </div>

      {/* 待處理區：只渲染 n > 0 的格（principles.md 規則二——「顯示 0 的統計卡」是呈現層噪音，
          一個永遠寫著 0 的格子每天消耗一次判斷卻從不需要行動）。
          「在職員工數」不是待處理事項，已移到員工分頁的標題旁。 */}
      <div className="mb-5">
        <StatGrid
          hideZero
          cols={3}
          items={[
            { n: pendingReviews ?? 0, label: '待審補卡', tone: 'warn', href: oh(slug, '/attend/reviews') },
            { n: pendingEmps ?? 0, label: '待啟用員工', tone: 'warn', href: oh(slug, '/attend/employees') },
            { n: withIssues.length, label: '本月有異常的員工', tone: 'err' },
          ]}
        />
      </div>

      {withIssues.length ? (
        <section className="space-y-3">
          {withIssues.map(({ emp, days }) => (
            <div key={emp.id} className="card">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-bold">{emp.display_name}</span>
                <span className="text-xs text-gray-500">{emp.dept ?? ''}</span>
                <a className="ml-auto text-sm text-emerald-700 underline" href={oh(slug, '/attend/report', { emp: emp.id })}>
                  報表 →
                </a>
              </div>
              <ul className="flex flex-wrap gap-2 text-xs">
                {days.map((d) => (
                  <li key={d.date} className="rounded-full bg-red-50 px-2.5 py-0.5 font-bold text-red-700">
                    {d.date}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <Empty
          title={pendingReviews || pendingEmps ? '本月沒有異常打卡' : '本月考勤沒有待處理事項'}
          hint={`${employees.length} 位在職員工的打卡都成對，也沒有待審或待啟用的項目。`}
        />
      )}
    </main>
  );
}
