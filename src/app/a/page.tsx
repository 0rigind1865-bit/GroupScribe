import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { LiffInit } from '@/app/g/liff-init';
import { PunchButtons } from './punch-client';

export const dynamic = 'force-dynamic';

// 員工打卡首頁（LIFF）：今日狀態＋上下班鈕。org 不放 URL——員工開 LIFF 的入口
// 必須是固定連結（LIFF endpoint 只有一個），org 由 employees 表以 line_user_id 反查。
const MSG: Record<string, { text: string; ok?: boolean }> = {
  'ok=in': { text: '上班打卡完成 ✓', ok: true },
  'ok=out': { text: '下班打卡完成 ✓', ok: true },
  'err=ERR_OUT_OF_RANGE': { text: '不在任何打卡地點範圍內，請到打卡地點後再試' },
  'err=ERR_SESSION': { text: '身分逾時，請關閉後重新開啟' },
  'err=ERR_WRITE': { text: '寫入失敗，請稍後再試' },
  'joined=1': { text: '已送出加入申請，請等管理員啟用帳號', ok: true },
};

export default async function AttendHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; joined?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const sp = await searchParams;
  const msgKey = sp.ok ? `ok=${sp.ok}` : sp.err ? `err=${sp.err}` : sp.joined ? 'joined=1' : '';
  const msg = MSG[msgKey];

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active') ?? employees[0];

  if (!emp) {
    // 尚未加入任何 org → 導去輸入加入碼
    return (
      <main className="mx-auto max-w-md p-5">
        <h1 className="mb-2 text-xl font-bold">打卡系統</h1>
        {msg && <p className={`mb-3 rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
        <p className="mb-4 text-sm text-gray-600">你還沒有加入任何公司。請向管理員索取加入碼。</p>
        <a href="/a/join" className="btn-primary inline-block">輸入加入碼</a>
      </main>
    );
  }

  if (emp.status !== 'active') {
    return (
      <main className="mx-auto max-w-md p-5">
        <h1 className="mb-2 text-xl font-bold">打卡系統</h1>
        {msg && <p className={`mb-3 rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
        <div className="card text-sm text-gray-600">
          {emp.status === 'pending'
            ? '帳號等待管理員啟用中，啟用後才能打卡。'
            : '帳號已被停用，請聯絡管理員。'}
        </div>
      </main>
    );
  }

  const today = workDate(new Date());
  const month = today.slice(0, 7);
  const { days } = await monthData(emp.org_id, emp.id, month);
  const todayStatus = days.find((d) => d.date === today);
  const abnormalCount = days.filter((d) => d.abnormal).length;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center gap-3">
        {emp.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.picture_url} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 font-bold text-white">
            {emp.display_name.slice(0, 1)}
          </span>
        )}
        <div>
          <p className="font-bold">{emp.display_name}</p>
          <p className="text-xs text-gray-500">{emp.dept ?? '—'}</p>
        </div>
      </header>

      {msg && <p className={`mb-3 rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <PunchButtons />

      <section className="card mt-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">今天（{today}）</h2>
        {todayStatus?.punches.length ? (
          <ul className="space-y-1 text-sm">
            {todayStatus.punches.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${p.type === 'in' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {p.type === 'in' ? '上班' : '下班'}
                </span>
                <span>{p.time}</span>
                {p.locationName && <span className="text-xs text-gray-500">{p.locationName}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">今天還沒有打卡紀錄。</p>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
        <a href="/a/records" className="card hover:bg-gray-50">
          <span className="block font-bold">本月紀錄</span>
          <span className="text-xs text-gray-500">月曆與打卡明細</span>
        </a>
        <a href="/a/adjust" className="card hover:bg-gray-50">
          <span className="block font-bold">補卡申請</span>
          {abnormalCount > 0 ? (
            <span className="text-xs font-bold text-red-600">{abnormalCount} 天有異常</span>
          ) : (
            <span className="text-xs text-gray-500">異常日補登</span>
          )}
        </a>
      </div>
    </main>
  );
}
