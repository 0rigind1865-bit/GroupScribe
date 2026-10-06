import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { currentRuleSet } from '@/attend/rules-store';
import { workDate } from '@/attend/util';
import { Banner } from '@/app/ui/banner';
import type { Frac, Tier } from '@/attend/salary';

export const dynamic = 'force-dynamic';

// 白話摘要（2026-10 設計畫布「薪資規則」）：平常看到的是「幾點休息、加班怎麼算」，JSON 與腳本收進「進階」
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const x = (f: Frac) => `×${(f.num / f.den).toFixed(2).replace(/\.?0+$/, '')}`;
const tiers = (ts: Tier[]) =>
  ts
    .map((t, i) => {
      const from = i === 0 ? 0 : (ts[i - 1].upToHours ?? 0);
      const span = t.upToHours == null ? (i === 0 ? '全部' : `第 ${from + 1} 小時起`) : i === 0 ? `前 ${t.upToHours} 小時` : `第 ${from + 1}–${t.upToHours} 小時`;
      return `${span} ${x(t.rate)}`;
    })
    .join('、');

// 薪資規則（兩層引擎的管理入口）：
//   第一層＝結構化規則 JSON（預設勞基法模板；表單即 JSON 編輯器＋伺服端 parseRules 驗證）
//   第二層＝自訂計算腳本（沙箱執行；存檔時先試跑一筆樣本，爛腳本當場擋下）
// 版本 append-only：每次存檔＝新版本；已結算月份讀快照，改規則不影響。
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

  const thisYear = workDate(new Date()).slice(0, 4);
  const yearHolidays = (holidays ?? []).filter((h) => h.day.startsWith(thisYear));

  const ERR: Record<string, string> = {
    ERR_RULES_INVALID: '規則 JSON 不合法（結構或數值有誤），未存檔',
    ERR_SCRIPT: `腳本試跑失敗，未存檔：${sp.msg ?? ''}`,
    ERR_WRITE: '寫入失敗，請重試',
    ERR_HOLIDAY_PARAMS: '假日日期或種類不合法',
  };

  return (
    <main className="page">
      <h1 className="mb-2">薪資規則</h1>
      <p className="mb-4 text-sm text-gray-600">
        {ruleSet.version === 0 ? '照勞基法的預設，還沒改過' : `第 ${ruleSet.version} 版`}。改了會存成新的一版；已經結算的月份不會變。
      </p>
      {sp.ok === 'holidays' && <Banner>台灣國定假日已匯入 ✓（原本就有的日子沒動）</Banner>}
      {sp.ok && sp.ok !== 'holidays' && <Banner>已存為第 {ruleSet.version} 版 ✓</Banner>}

      <section className="card mb-4 text-sm">
        <h2 className="card-title mb-2">現在怎麼算</h2>
        <dl className="divide-y divide-gray-100">
          {[
            ['時薪', `月薪 ÷ ${ruleSet.rules.baseDivisor}`],
            ['一天正常工時', `${ruleSet.rules.normalDailyHours} 小時`],
            ['休息時段（不算工時）', ruleSet.rules.breaks.map((b) => `${b.start}–${b.end}`).join('、') || '沒有'],
            ['休息日／例假日', `週${WEEKDAY[ruleSet.rules.weeklyRestDay]}／週${WEEKDAY[ruleSet.rules.weeklyRegularOff]}`],
            ['平日加班', tiers(ruleSet.rules.weekday.tiers)],
            ['休息日上班', tiers(ruleSet.rules.restDay.tiers)],
            ['國定假日上班', `給一天工資（${ruleSet.rules.holiday.guaranteedHours} 小時），再加班：${tiers(ruleSet.rules.holiday.otTiers)}`],
            ['例假日上班', `給一天工資，超過 ${ruleSet.rules.regularOff.guaranteedHours} 小時 ${x(ruleSet.rules.regularOff.over8Rate)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="flex-none text-gray-600">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {ruleSet.scriptEnabled && <p className="mt-2 text-xs font-bold text-amber-800">另外有啟用自訂計算方式（見下方「進階」）。</p>}
      </section>
      {sp.err && <Banner tone="err">{ERR[sp.err] ?? sp.err}</Banner>}

      {/* 進階：直接改規則原文。HR 或老闆平常不用打開；會寫程式的人才需要 */}
      <details className="card mb-4" open={!!sp.err && sp.err !== 'ERR_HOLIDAY_PARAMS'}>
        <summary className="card-title flex min-h-11 cursor-pointer items-center">進階：直接改規則（給會寫程式的人）</summary>
      <form action="/api/attend/rules" method="post" className="mt-3 space-y-4">
        <input type="hidden" name="org" value={slug} />

        <section className="card">
          <h2 className="mb-3 card-title">結構化規則（JSON）</h2>
          <p className="mb-2 text-xs text-gray-500">
            倍率一律寫成分數 {'{"num":4,"den":3}'}（4/3）避免浮點誤差。breaks＝休息時段（重疊分鐘自動扣除）；
            tiers 的 upToHours＝累計時數門檻，null＝無上限。
          </p>
          <textarea
            name="rules"
            rows={18}
            className="input w-full font-mono text-xs"
            defaultValue={JSON.stringify(ruleSet.rules, null, 2)}
          />
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

        <button className="btn-primary" name="action" value="save">存成第 {ruleSet.version + 1} 版</button>
      </form>
      </details>

      <section className="card mt-6">
        <h2 className="mb-3 card-title">假日表（{thisYear} 年，{yearHolidays.length} 筆）</h2>
        <p className="mb-2 text-xs text-gray-600">國定假日上班有加給；補班日照平日算。</p>
        <form action="/api/attend/rules" method="post" className="mb-3">
          <input type="hidden" name="org" value={slug} />
          <button className="btn btn-sm" name="action" value="holiday_seed">
            匯入台灣國定假日
          </button>
          <span className="ml-2 text-xs text-gray-600">已經有的日子不會被蓋掉；請對照人事行政總處公告</span>
        </form>
        <form action="/api/attend/rules" method="post" className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="action" value="holiday_add" />
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">日期</span>
            <input className="input" type="date" name="day" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">種類</span>
            <select className="input" name="kind">
              <option value="national">國定假日</option>
              <option value="workday_override">補班日</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">名稱</span>
            <input className="input w-36" name="name" placeholder="例：中秋節" />
          </label>
          <button className="btn px-3 py-1.5">新增</button>
        </form>
        <ul className="grid gap-1 text-sm md:grid-cols-2">
          {yearHolidays.map((h) => (
            <li key={h.day} className="flex items-center gap-2">
              <span className="font-mono text-xs">{h.day}</span>
              <span className={h.kind === 'national' ? 'text-red-600' : 'text-gray-600'}>
                {h.kind === 'national' ? h.name || '國定假日' : `補班${h.name ? `（${h.name}）` : ''}`}
              </span>
              <form action="/api/attend/rules" method="post" className="ml-auto">
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="action" value="holiday_del" />
                <input type="hidden" name="day" value={h.day} />
                <button className="text-xs text-gray-400 hover:text-red-600">✕</button>
              </form>
            </li>
          ))}
          {!yearHolidays.length && <li className="text-gray-500">今年還沒有假日資料。</li>}
        </ul>
      </section>

      {(versions ?? []).length > 0 && (
        <section className="mt-6">
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
    </main>
  );
}
