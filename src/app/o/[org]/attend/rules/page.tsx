import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { currentRuleSet } from '@/attend/rules-store';
import { workDate } from '@/attend/util';
import { Banner } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import type { Frac, Tier } from '@/attend/salary';

export const dynamic = 'force-dynamic';

// 薪資規則（2026-10 設計畫布「薪資規則」）：平常看到的是白話——上班時間、加班費怎麼算、今年哪天放假；
// JSON 與程式碼收到最下面「給會寫程式的人」。假日用「匯入政府公告」，不叫人跑指令。
//   第一層＝結構化規則 JSON（預設勞基法模板；表單即 JSON 編輯器＋伺服端 parseRules 驗證）
//   第二層＝自訂計算腳本（沙箱執行；存檔時先試跑一筆樣本，爛腳本當場擋下）
// 版本 append-only：每次存檔＝新版本；已結算月份讀快照，改規則不影響。
// ponytail: 設計稿「上班時間」「加班費」旁的「改」沒做成表單——要改還是走最下面的 JSON（白話表單之後再補）
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const x = (f: Frac) => `×${(f.num / f.den).toFixed(2).replace(/\.?0+$/, '')}`;
/** 一段一行：前 2 小時 ×1.34、第 3–4 小時 ×1.67 */
const tiers = (ts: Tier[]) =>
  ts.map((t, i) => {
    const from = i === 0 ? 0 : (ts[i - 1].upToHours ?? 0);
    const span = t.upToHours == null ? (i === 0 ? '全部' : `第 ${from + 1} 小時起`) : i === 0 ? `前 ${t.upToHours} 小時` : `第 ${from + 1}–${t.upToHours} 小時`;
    return `${span} ${x(t.rate)}`;
  });
const mdw = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}（週${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]}）`;

export default async function RulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string; msg?: string; tab?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const sp = await searchParams;
  const db = getDb();

  const [ruleSet, { data: versions }, { data: holidays }] = await Promise.all([
    currentRuleSet(org.id),
    db
      .from('salary_rule_sets')
      .select('version, created_at, created_by, script_enabled')
      .eq('org_id', org.id)
      .order('version', { ascending: false })
      .limit(10),
    db.from('holidays').select('day, kind, name').eq('org_id', org.id).order('day'),
  ]);
  const r = ruleSet.rules;

  const today = workDate(new Date());
  const thisYear = today.slice(0, 4);
  const yearHolidays = (holidays ?? []).filter((h) => h.day.startsWith(thisYear));
  const upcoming = yearHolidays.filter((h) => h.day >= today).slice(0, 3);
  // 假日區的三顆：全部（?tab=holidays，API 加／刪一天後也回這裡）、加一天（?tab=add）、匯入政府公告
  const tab = sp.err === 'ERR_HOLIDAY_PARAMS' ? 'add' : sp.tab;
  const codeErr = !!sp.err && sp.err !== 'ERR_HOLIDAY_PARAMS';

  const ERR: Record<string, string> = {
    ERR_RULES_INVALID: '規則 JSON 不合法（結構或數值有誤），未存檔',
    ERR_SCRIPT: `腳本試跑失敗，未存檔：${sp.msg ?? ''}`,
    ERR_WRITE: '寫入失敗，請重試',
    ERR_HOLIDAY_PARAMS: '假日日期或種類不合法',
  };

  const holidayName = (h: { kind: string; name: string | null }) => (h.kind === 'national' ? h.name || '國定假日' : `補班${h.name ? `（${h.name}）` : ''}`);

  return (
    <main className="page">
      <h1>薪資規則</h1>
      <p className="mt-1.5 mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-gray-600">
        {ruleSet.version === 0 ? (
          <>
            <Badge tone="ok">照勞基法</Badge>還沒改過
          </>
        ) : (
          <>目前第 {ruleSet.version} 版</>
        )}
        {ruleSet.scriptEnabled && <Badge tone="warn">含自訂計算方式</Badge>}
      </p>
      {sp.ok === 'holidays' && <Banner>台灣國定假日已匯入 ✓（原本就有的日子沒動）</Banner>}
      {sp.ok && sp.ok !== 'holidays' && <Banner>已存為第 {ruleSet.version} 版 ✓</Banner>}
      {sp.err && <Banner tone="err">{ERR[sp.err] ?? sp.err}</Banner>}

      <div className="space-y-3">
        <section className="card text-sm">
          <h2 className="card-title mb-1">上班時間</h2>
          <p className="leading-loose text-gray-700">
            一天正常 {r.normalDailyHours} 小時
            <br />
            {r.breaks.length ? `休息 ${r.breaks.map((b) => `${b.start}–${b.end}`).join('、')}（不算工時）` : '沒有扣休息時間'}
            <br />
            休息日週{WEEKDAY[r.weeklyRestDay]}、例假日週{WEEKDAY[r.weeklyRegularOff]}
          </p>
        </section>

        <section className="card text-sm">
          <h2 className="card-title mb-1">加班費</h2>
          <dl className="divide-y divide-gray-100">
            {(
              [
              ['時薪', [`月薪 ÷ ${r.baseDivisor}`]],
              ['平日加班', tiers(r.weekday.tiers)],
              ['休息日上班', tiers(r.restDay.tiers)],
              ['國定假日上班', [`給一天工資（${r.holiday.guaranteedHours} 小時）`, ...tiers(r.holiday.otTiers).map((t) => `再加班 ${t}`)]],
              ['例假日上班', [`給一天工資，超過 ${r.regularOff.guaranteedHours} 小時 ${x(r.regularOff.over8Rate)}`]],
              ] as [string, string[]][]
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="flex-none text-gray-600">{k}</dt>
                <dd className="text-right">
                  {v.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="card-title mb-1">{thisYear} 年的假日</h2>
          {tab === 'holidays' ? (
            <ul className="divide-y divide-gray-100">
              {yearHolidays.map((h) => (
                <li key={h.day} className="flex min-h-10 items-center gap-2">
                  <span className="tabular-nums">{mdw(h.day)}</span>
                  <span className={`flex-1 text-right ${h.kind === 'national' ? 'text-red-600' : 'text-gray-600'}`}>{holidayName(h)}</span>
                  <form action="/api/attend/rules" method="post">
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="action" value="holiday_del" />
                    <input type="hidden" name="day" value={h.day} />
                    <button className="grid h-10 w-10 place-items-center text-gray-400 hover:text-red-600" aria-label={`刪掉 ${h.day}`}>
                      ✕
                    </button>
                  </form>
                </li>
              ))}
              {!yearHolidays.length && <li className="py-2 text-gray-500">今年還沒有假日資料，按「匯入政府公告」。</li>}
            </ul>
          ) : (
            <>
              {upcoming.map((h) => (
                <div key={h.day} className="flex justify-between py-1">
                  <span className="tabular-nums">{mdw(h.day)}</span>
                  <span className="text-gray-600">{holidayName(h)}</span>
                </div>
              ))}
              <p className="mt-1 text-[13px] text-gray-600">
                {!yearHolidays.length
                  ? '今年還沒有假日資料，按「匯入政府公告」。'
                  : yearHolidays.length > upcoming.length
                    ? `今年共 ${yearHolidays.length} 天，點「全部」看`
                    : '今年剩下的就這些'}
              </p>
            </>
          )}

          {tab === 'add' && (
            <form action="/api/attend/rules" method="post" className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="action" value="holiday_add" />
              <label className="block">
                <span className="label mb-1 block">日期</span>
                <input className="input w-full" type="date" name="day" required />
              </label>
              <label className="block">
                <span className="label mb-1 block">種類</span>
                <select className="input w-full" name="kind">
                  <option value="national">國定假日</option>
                  <option value="workday_override">補班日</option>
                </select>
              </label>
              <label className="col-span-2 block">
                <span className="label mb-1 block">名稱</span>
                <input className="input w-full" name="name" placeholder="例：中秋節" />
              </label>
              <button className="btn-primary col-span-2">加這一天</button>
            </form>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn" href={oh(slug, '/attend/rules', { tab: tab === 'holidays' ? undefined : 'holidays' })}>
              {tab === 'holidays' ? '收起' : '全部'}
            </a>
            <a className="btn" href={oh(slug, '/attend/rules', { tab: tab === 'add' ? undefined : 'add' })}>
              {tab === 'add' ? '取消' : '加一天'}
            </a>
            <form action="/api/attend/rules" method="post">
              <input type="hidden" name="org" value={slug} />
              <button className="btn" name="action" value="holiday_seed">
                匯入政府公告
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-gray-600">國定假日上班有加給、補班日照平日算。匯入不會蓋掉你已經加的日子；請對照人事行政總處公告。</p>
        </section>

        {/* 給會寫程式的人：直接改規則原文與自訂腳本。HR 或老闆平常不用打開 */}
        <details className="rounded-[14px] border border-dashed border-gray-300" open={codeErr}>
          <summary className="flex min-h-[52px] cursor-pointer items-center gap-2.5 px-3.5 text-sm text-gray-700">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
            </svg>
            <span className="flex-1">自訂計算方式（給會寫程式的人）</span>
          </summary>
          <form action="/api/attend/rules" method="post" className="space-y-4 px-3.5 pb-3.5">
            <input type="hidden" name="org" value={slug} />

            <section className="card">
              <h2 className="mb-3 card-title">結構化規則（JSON）</h2>
              <p className="mb-2 text-xs text-gray-500">
                倍率一律寫成分數 {'{"num":4,"den":3}'}（4/3）避免浮點誤差。breaks＝休息時段（重疊分鐘自動扣除）；
                tiers 的 upToHours＝累計時數門檻，null＝無上限。
              </p>
              <textarea name="rules" rows={18} className="input w-full font-mono text-xs" defaultValue={JSON.stringify(r, null, 2)} />
            </section>

            <section className="card">
              <h2 className="mb-3 card-title">自訂計算腳本（進階，選用）</h2>
              <p className="mb-2 text-xs text-gray-500">
                沙箱執行（無網路/檔案，記憶體 32MB、單日 100ms）。輸入：全域 <code>ctx</code>（date, dayType, inTime,
                outTime, netMinutes, breakMinutes, hourlyRate, monthlySalary, rules）。輸出：最後一個運算式，格式{' '}
                <code>{'({ pay, normalHours, overtimeHours, breakdown: [{label, hours, amount}] })'}</code>。
                腳本失敗的日子自動回退上方結構化規則，並在月曆頁顯示錯誤。
              </p>
              <textarea
                name="script"
                rows={10}
                className="input w-full font-mono text-xs"
                placeholder={`// 範例：淨工時超過 8h 的部分一律 ×1.5\nconst ot = Math.max(0, ctx.netMinutes / 60 - 8);\n({\n  pay: ot * ctx.hourlyRate * 1.5,\n  normalHours: Math.min(ctx.netMinutes / 60, 8),\n  overtimeHours: ot,\n  breakdown: ot > 0 ? [{ label: '加班 ×1.5', hours: ot, amount: ot * ctx.hourlyRate * 1.5 }] : [],\n})`}
                defaultValue={ruleSet.script ?? ''}
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="script_enabled" defaultChecked={ruleSet.scriptEnabled} />
                啟用腳本（未勾＝只用結構化規則）
              </label>
            </section>

            <button className="btn-primary" name="action" value="save">
              存成第 {ruleSet.version + 1} 版
            </button>

            {(versions ?? []).length > 0 && (
              <section>
                <h2 className="mb-2 section-title">版本歷史</h2>
                <ul className="space-y-1 text-sm text-gray-600">
                  {(versions ?? []).map((v) => (
                    <li key={v.version}>
                      v{v.version}｜{new Date(v.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
                      {v.script_enabled && '｜含腳本'}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </form>
        </details>

        <p className="text-xs leading-relaxed text-gray-600">改了會存成第 {ruleSet.version + 1} 版，從還沒結算的月份開始用。已經結算的月份不會變。</p>
      </div>
    </main>
  );
}
