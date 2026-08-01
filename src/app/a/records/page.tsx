import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { isYm, workDate } from '@/attend/util';
import { monthGrid } from '@/core/grid';
import { LiffInit } from '@/app/g/liff-init';
import type { DayStatus } from '@/attend/abnormal';

export const dynamic = 'force-dynamic';

// 我的月曆與打卡明細（對等舊員工月曆）。日格顏色 = 每日狀態；點日期看當日明細（?d=）。
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

const CELL: Record<DayStatus['status'], string> = {
  STATUS_PUNCH_NORMAL: 'bg-emerald-100 text-emerald-900',
  STATUS_REPAIR_APPROVED: 'bg-teal-100 text-teal-900',
  STATUS_REPAIR_PENDING: 'bg-amber-100 text-amber-900',
  STATUS_PUNCH_IN_MISSING: 'bg-red-100 text-red-800',
  STATUS_PUNCH_OUT_MISSING: 'bg-red-100 text-red-800',
  STATUS_PUNCH_BOTH_MISSING: 'bg-gray-100 text-gray-400',
  STATUS_TODAY_OPEN: 'bg-sky-100 text-sky-900',
};

const STATUS_TEXT: Record<DayStatus['status'], string> = {
  STATUS_PUNCH_NORMAL: '正常',
  STATUS_REPAIR_APPROVED: '補卡通過',
  STATUS_REPAIR_PENDING: '補卡審核中',
  STATUS_PUNCH_IN_MISSING: '未打上班卡',
  STATUS_PUNCH_OUT_MISSING: '未打下班卡',
  STATUS_PUNCH_BOTH_MISSING: '無打卡',
  STATUS_TODAY_OPEN: '進行中',
};

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; d?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  if (!emp) {
    return (
      <main className="mx-auto max-w-md p-5">
        <p className="text-sm text-gray-600">帳號尚未啟用。</p>
      </main>
    );
  }

  const sp = await searchParams;
  const today = workDate(new Date());
  const month = sp.month && isYm(sp.month) ? sp.month : today.slice(0, 7);
  const { days } = await monthData(emp.org_id, emp.id, month);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const [y, m] = month.split('-').map(Number);
  const weeks = monthGrid(y, m);
  const sel = sp.d && byDate.has(sp.d) ? byDate.get(sp.d)! : null;

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-3 flex items-center justify-between">
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, -1)}`}>←</a>
        <h1 className="text-lg font-bold">{y} 年 {m} 月</h1>
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, 1)}`}>→</a>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-xs text-gray-500">
        {WEEK.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell, i) => {
          if (!cell) return <div key={i} />;
          const st = byDate.get(cell.iso);
          const cls = st ? CELL[st.status] : 'text-gray-400';
          return (
            <a
              key={i}
              href={st ? `/a/records?month=${month}&d=${cell.iso}` : undefined}
              className={`grid h-10 place-items-center rounded text-sm ${cls} ${sp.d === cell.iso ? 'ring-2 ring-emerald-500' : ''}`}
            >
              {cell.day}
            </a>
          );
        })}
      </div>

      {sel && (
        <section className="card mt-4">
          <h2 className="mb-1 text-sm font-bold text-gray-700">
            {sel.date}｜{STATUS_TEXT[sel.status]}
          </h2>
          {sel.punches.length ? (
            <ul className="space-y-1 text-sm">
              {sel.punches.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${p.type === 'in' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {p.type === 'in' ? '上班' : '下班'}
                  </span>
                  <span>{p.time}</span>
                  {p.source === 'adjustment' && <span className="rounded bg-teal-100 px-1 text-xs text-teal-800">補卡</span>}
                  {p.locationName && <span className="text-xs text-gray-500">{p.locationName}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">這天沒有打卡紀錄。</p>
          )}
          {sel.abnormal && (
            <a href="/a/adjust" className="mt-2 inline-block text-sm text-emerald-700 underline">
              去補卡 →
            </a>
          )}
        </section>
      )}

      <a href="/a" className="mt-4 inline-block text-sm text-gray-500 underline">← 回打卡首頁</a>
    </main>
  );
}
