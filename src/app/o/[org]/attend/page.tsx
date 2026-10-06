import { getDb } from '@/db';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { Empty } from '@/app/ui/empty';
import { notFound } from 'next/navigation';
import { monthData } from '@/attend/data';
import { taipeiHm, workDate } from '@/attend/util';
import type { DayStatus } from '@/attend/abnormal';
import type { Employee } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 考勤「今天」（2026-10 設計畫布）：一眼看現在誰在班；等你處理的事寫出是誰；
// 本月異常寫清楚少了哪一張卡、點了直接到那個人。授權在 layout 完成；此頁只讀。

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const wd = (iso: string) => WEEK[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}（週${wd(iso)}）`;
/** 少了哪張卡：從那天實際打到的卡推（補卡審核中的日子狀態只剩「等審」，一樣要說缺什麼） */
const missing = (d: DayStatus) => {
  const has = (t: string) => d.punches.some((p) => p.type === t);
  return has('in') ? '少下班卡' : has('out') ? '少上班卡' : '整天沒打卡';
};

export default async function AttendToday({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const db = getDb();

  const today = workDate(new Date());
  const month = today.slice(0, 7);
  const [{ data: emps }, { data: reviews }, { data: pendingEmps }, { data: punches }] = await Promise.all([
    db.from('employees').select('*').eq('org_id', org.id).eq('status', 'active').order('display_name'),
    db.from('adjustment_requests').select('employees(display_name)').eq('org_id', org.id).eq('status', 'pending'),
    db.from('employees').select('display_name, dept').eq('org_id', org.id).eq('status', 'pending'),
    db.from('punch_records').select('employee_id, type, punched_at, location_name').eq('org_id', org.id).eq('work_date', today).order('punched_at'),
  ]);
  const employees = (emps ?? []) as Employee[];

  // 現在在班＝今天打了上班卡、還沒打下班卡；已下班＝兩張都有
  const todayOf = new Map<string, { in?: string; out?: string; place?: string | null }>();
  for (const p of punches ?? []) {
    const t = todayOf.get(p.employee_id) ?? {};
    if (p.type === 'in' && !t.in) Object.assign(t, { in: taipeiHm(new Date(p.punched_at)), place: p.location_name });
    if (p.type === 'out') t.out = taipeiHm(new Date(p.punched_at));
    todayOf.set(p.employee_id, t);
  }
  const onShift = employees.filter((e) => todayOf.get(e.id)?.in && !todayOf.get(e.id)?.out);
  const offShift = employees.filter((e) => todayOf.get(e.id)?.out);
  const notIn = employees.length - onShift.length - offShift.length;

  // 小團隊（<50 人）逐員查本月狀態即可；量大再改成單查 group by
  const issues = (
    await Promise.all(
      employees.map(async (e) => {
        const { days } = await monthData(org.id, e.id, month);
        return { emp: e, days: days.filter((d) => d.abnormal || d.status === 'STATUS_REPAIR_PENDING') }; // 已送補卡的也列，標「已送補卡」
      }),
    )
  ).filter((a) => a.days.length > 0);

  const reviewNames = [...new Set((reviews ?? []).map((r: any) => r.employees?.display_name).filter(Boolean))] as string[];
  const todo = [
    reviewNames.length > 0 && { n: (reviews ?? []).length, label: '筆補卡等你審', who: reviewNames.join('、'), href: oh(slug, '/attend/reviews') },
    (pendingEmps ?? []).length > 0 && {
      n: (pendingEmps ?? []).length,
      label: '位新員工等你啟用',
      who: (pendingEmps ?? []).map((e: any) => `${e.display_name}${e.dept ? ` · ${e.dept}` : ''}`).join('、'),
      href: oh(slug, '/attend/employees'),
    },
  ].filter(Boolean) as { n: number; label: string; who: string; href: string }[];

  return (
    <main className="page">
      <div className="mb-4 flex items-baseline gap-3">
        <h1>今天</h1>
        <span className="text-sm text-gray-600">
          {Number(today.slice(5, 7))} 月 {Number(today.slice(8, 10))} 日 · 週{wd(today)}
        </span>
      </div>

      {employees.length > 0 && (
        <section className="card mb-5" aria-label="現在在班">
          <div className="grid grid-cols-3 text-center">
            {[
              { n: onShift.length, label: '在班', cls: 'text-emerald-700' },
              { n: offShift.length, label: '已下班', cls: 'text-gray-900' },
              { n: notIn, label: '還沒打卡', cls: 'text-gray-500' },
            ].map((s, i) => (
              <div key={s.label} className={i === 1 ? 'border-x border-gray-100' : ''}>
                <div className={`text-3xl leading-tight font-black tabular-nums ${s.cls}`} style={{ fontFamily: 'var(--font-title)' }}>
                  {s.n}
                </div>
                <div className="text-sm font-bold">{s.label}</div>
              </div>
            ))}
          </div>
          {onShift.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-sm">
              {onShift.map((e) => {
                const t = todayOf.get(e.id)!;
                return (
                  <li key={e.id} className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-xs font-black text-emerald-900">{e.display_name.slice(-1)}</span>
                    <span className="flex-1 font-bold">{e.display_name}</span>
                    <span className="text-xs text-gray-600">
                      {t.in} 上班{t.place ? ` · ${t.place}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {todo.length > 0 && (
        <section className="mb-5">
          <h2 className="section-title mb-2 text-amber-700">等你處理</h2>
          <div className="space-y-2">
            {todo.map((t) => (
              <a key={t.label} href={t.href} className="flex min-h-15 items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-900 hover:opacity-80">
                <span className="text-2xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
                  {t.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{t.label}</span>
                  <span className="block truncate text-xs">{t.who}</span>
                </span>
                <span aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title mb-2">這個月的異常</h2>
        {issues.length ? (
          <div className="space-y-2">
            {/* 名字連到他的月份；每一顆日子連到那一天（?d=），點了直接看那天少什麼、怎麼算 */}
            {issues.map(({ emp, days }) => (
              <div key={emp.id} className="card">
                <a href={oh(slug, '/attend/report', { emp: emp.id, month })} className="flex min-h-8 items-center gap-2 hover:opacity-80">
                  <span className="font-bold">{emp.display_name}</span>
                  <span className="text-xs text-gray-600">{emp.dept ?? ''}</span>
                  <span className="ml-auto text-sm text-gray-400" aria-hidden="true">
                    ›
                  </span>
                </a>
                <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {days.map((d) => {
                    const sent = d.status === 'STATUS_REPAIR_PENDING';
                    return (
                      <a
                        key={d.date}
                        href={oh(slug, '/attend/report', { emp: emp.id, month, d: d.date })}
                        className={`inline-flex min-h-8 items-center rounded-full px-2.5 font-bold ${sent ? 'bg-amber-100 text-amber-900' : 'bg-red-50 text-red-700'}`}
                      >
                        {md(d.date)} {missing(d)}
                        {sent && ' · 已送補卡'}
                      </a>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="這個月沒有異常" hint={`${employees.length} 位在職員工的打卡都成對。`} />
        )}
      </section>
    </main>
  );
}
