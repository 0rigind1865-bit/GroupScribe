import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { LiffInit } from '@/app/g/liff-init';

export const dynamic = 'force-dynamic';

// 補卡申請（對等舊補打卡 UI）：本月異常日清單（點了帶入日期與建議時間）＋
// datetime-local 表單 ＋ 我的申請狀態。原生 input 取代舊系統手刻的日期驗證。
const ERR: Record<string, string> = {
  ERR_ADJUST_RANGE: '只能補上個月 1 號之後、不晚於現在的時間',
  ERR_WRITE: '寫入失敗，請稍後再試',
  ERR_SESSION: '身分逾時，請關閉後重新開啟',
};

const STATUS_BADGE: Record<string, [string, string]> = {
  pending: ['審核中', 'bg-amber-100 text-amber-800'],
  approved: ['已核准', 'bg-emerald-100 text-emerald-800'],
  rejected: ['已拒絕', 'bg-red-100 text-red-700'],
};

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; d?: string; t?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  if (!emp) return <main className="mx-auto max-w-md p-5 text-sm text-gray-600">帳號尚未啟用。</main>;

  const sp = await searchParams;
  const today = workDate(new Date());
  const { days } = await monthData(emp.org_id, emp.id, today.slice(0, 7));
  const abnormal = days.filter((d) => d.abnormal);

  const { data: reqs } = await getDb()
    .from('adjustment_requests')
    .select('id, type, requested_at, reason, status, created_at')
    .eq('org_id', emp.org_id)
    .eq('employee_id', emp.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // 點異常日帶入預設：缺上班卡 → 09:00、缺下班卡 → 18:00（對等舊 UI 的預設時間）
  const defType = sp.t === 'out' ? 'out' : 'in';
  const defDatetime = sp.d ? `${sp.d}T${defType === 'in' ? '09:00' : '18:00'}` : '';

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-3 text-xl font-bold">補卡申請</h1>
      {sp.ok && <p className="mb-3 rounded bg-emerald-50 p-2 text-sm text-emerald-800">已送出申請，等待管理員審核 ✓</p>}
      {sp.err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{ERR[sp.err] ?? sp.err}</p>}

      {abnormal.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-sm font-bold text-gray-700">本月異常（{abnormal.length} 天）</h2>
          <ul className="space-y-1.5 text-sm">
            {abnormal.map((d) => {
              const missIn = !d.punches.some((p) => p.type === 'in');
              const missOut = !d.punches.some((p) => p.type === 'out');
              return (
                <li key={d.date} className="flex items-center gap-2">
                  <span>{d.date}</span>
                  <span className="text-xs text-red-600">
                    {missIn && missOut ? '未打上下班卡' : missIn ? '未打上班卡' : '未打下班卡'}
                  </span>
                  <a
                    className="ml-auto text-xs text-emerald-700 underline"
                    href={`/a/adjust?d=${d.date}&t=${missIn ? 'in' : 'out'}`}
                  >
                    帶入 →
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action="/api/attend/adjust" method="post" className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">類別</span>
          <select className="input w-full" name="type" defaultValue={defType}>
            <option value="in">上班卡</option>
            <option value="out">下班卡</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">日期與時間</span>
          <input className="input w-full" type="datetime-local" name="datetime" defaultValue={defDatetime} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">原因（選填）</span>
          <input className="input w-full" name="reason" placeholder="例：忘記打卡、外勤" />
        </label>
        <button className="btn-primary w-full">送出補卡申請</button>
      </form>

      {(reqs ?? []).length > 0 && (
        <section className="card mt-4">
          <h2 className="mb-2 text-sm font-bold text-gray-700">我的申請</h2>
          <ul className="space-y-1.5 text-sm">
            {(reqs ?? []).map((r) => {
              const [label, cls] = STATUS_BADGE[r.status] ?? [r.status, 'bg-gray-100 text-gray-600'];
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <span>{new Date(r.requested_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-xs text-gray-500">{r.type === 'in' ? '上班' : '下班'}</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <a href="/a" className="mt-4 inline-block text-sm text-gray-500 underline">← 回打卡首頁</a>
    </main>
  );
}
