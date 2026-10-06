import { redirect } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import type { Tone } from '@/app/ui/tone';
import { AttendLiffBoot, AttendShell } from '../shell';
import { shellData } from '../shell-data';

export const dynamic = 'force-dynamic';

// 補卡申請（設計畫布 StaffAdjust）：本月缺卡的日子一天一張紅卡（點了帶入日期與建議時間）＋
// datetime-local 表單（原因用點的，外籍員工不必打字）＋ 我的申請狀態。
const ERR: Record<string, MsgKey> = {
  ERR_ADJUST_RANGE: 'ERR_ADJUST_RANGE',
  ERR_WRITE: 'ERR_WRITE',
  ERR_SESSION: 'ERR_SESSION',
};

// 點缺卡日帶入的預設時間（對等舊 UI）
// ponytail: 固定 09:00／18:00；公司規則有上下班時間欄位時改讀規則
const DEF_TIME = { in: '09:00', out: '18:00' } as const;
const REASONS: MsgKey[] = ['REASON_FORGOT', 'REASON_FIELD', 'REASON_BATTERY'];

const STATUS_BADGE: Record<string, [MsgKey, Tone]> = {
  pending: ['REQ_PENDING', 'warn'],
  approved: ['REQ_APPROVED', 'ok'],
  rejected: ['REQ_REJECTED', 'err'],
};

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; d?: string; t?: string }>;
}) {
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const uid = await liffUser();
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  const { inGroups: _g, ...sd } = await shellData(uid, emp, employees);
  // 還沒加入或還沒啟用：回打卡頁——那裡會講清楚現在的狀態並給下一步（輸入加入碼／重新整理），
  // 這頁只剩一行「尚未啟用」是死路（審查 F34）
  if (!emp) redirect('/a');

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
  const defDatetime = sp.d ? `${sp.d}T${DEF_TIME[defType]}` : '';

  return (
    <AttendShell emp={emp} current="requests" loc={loc} tt={tt} back="/a/adjust" {...sd} title={tt('TAB_REQUESTS')} alert={abnormal.length}>
      {sp.ok && <Banner>{tt('MSG_ADJUST_SENT')}</Banner>}
      {sp.err && <Banner tone="err">{ERR[sp.err] ? tt(ERR[sp.err]) : sp.err}</Banner>}

      {abnormal.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-bold text-gray-600">{tt('ADJUST_MONTH_ABNORMAL', { n: abnormal.length })}</h2>
          {/* 整張卡都能點（原本只有一行小字底線連結）：點了日期、上班或下班、建議時間一起帶進下面的表單 */}
          <ul className="space-y-2">
            {abnormal.map((d) => {
              const missIn = !d.punches.some((p) => p.type === 'in');
              const missOut = !d.punches.some((p) => p.type === 'out');
              const ty = missIn ? 'in' : 'out';
              const day = new Date(`${d.date}T12:00:00+08:00`).toLocaleDateString(loc, { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short' });
              return (
                <li key={d.date}>
                  <a
                    href={`/a/adjust?d=${d.date}&t=${ty}`}
                    className={`flex min-h-14 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-red-700 ${sp.d === d.date ? 'ring-2 ring-emerald-500' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        {day} {missIn && missOut ? tt('MISS_BOTH') : missIn ? tt('MISS_IN') : tt('MISS_OUT')}
                      </span>
                      <span className="block text-xs">{tt('ADJUST_AUTO_FILL', { t: DEF_TIME[ty] })}</span>
                    </span>
                    <span className="flex-none text-sm font-bold">{tt('FILL_IN')}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action="/api/attend/adjust" method="post" className="card space-y-3">
        {/* 表單要有標題：點底部「我的申請」進來直接是一張表，3 秒內答不出這頁幹嘛（審查 F22） */}
        <h2 className="card-title">{tt('ADJUST_TITLE')}</h2>
        {/* 兩個選項用兩顆分段鈕，不用 <select>：LINE 內建瀏覽器要多一步開系統選單（審查 F54、畫布 StaffAdjust） */}
        <fieldset className="text-sm">
          <legend className="mb-1 block font-bold text-gray-700">{tt('TYPE_LABEL')}</legend>
          <div className="segmented w-full">
            {(['in', 'out'] as const).map((v) => (
              <label key={v} className="flex-1">
                <input type="radio" name="type" value={v} defaultChecked={defType === v} className="sr-only" />
                {tt(v === 'in' ? 'IN_CARD' : 'OUT_CARD')}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('DATETIME_LABEL')}</span>
          <input className="input w-full" type="datetime-local" name="datetime" defaultValue={defDatetime} required />
        </label>
        {/* 原因用點的；存中文（管理者看中文），畫面照員工的語言。自己寫的優先 */}
        <fieldset className="text-sm">
          <legend className="mb-1 block font-bold text-gray-700">{tt('REASON_LABEL')}</legend>
          <div className="pick-chips">
            {REASONS.map((k) => (
              <label key={k}>
                <input type="radio" name="reason_pick" value={t('zh-TW', k)} className="sr-only" />
                {tt(k)}
              </label>
            ))}
          </div>
          <input className="input mt-2 w-full" name="reason" placeholder={tt('REASON_OTHER_PLACEHOLDER')} />
        </fieldset>
        <button className="btn-primary w-full">{tt('SUBMIT_ADJUST')}</button>
      </form>

      {(reqs ?? []).length > 0 && (
        <section className="card mt-4">
          <h2 className="mb-2 card-title">{tt('MY_REQUESTS')}</h2>
          <ul className="space-y-1.5 text-sm">
            {(reqs ?? []).map((r) => {
              const [labelKey, tone] = STATUS_BADGE[r.status] ?? ['REQ_PENDING' as MsgKey, 'neutral' as Tone];
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <span>{new Date(r.requested_at).toLocaleString(loc, { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-xs text-gray-500">{r.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}</span>
                  <span className="ml-auto">
                    <Badge tone={tone}>{tt(labelKey)}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

    </AttendShell>
  );
}
