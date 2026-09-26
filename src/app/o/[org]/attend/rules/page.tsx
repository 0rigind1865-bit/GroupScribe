import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { currentRuleSet } from '@/attend/rules-store';
import { workDate } from '@/attend/util';
import { Banner } from '@/app/ui/banner';

export const dynamic = 'force-dynamic';

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
      <p className="mb-4 text-sm text-gray-500">
        目前版本：v{ruleSet.version}
        {ruleSet.version === 0 && '（預設勞基法模板，尚未自訂）'}｜每次存檔會建立新版本；已結算月份不受影響。
      </p>
      {sp.ok && <Banner>已存為 v{ruleSet.version} ✓</Banner>}
      {sp.err && <Banner tone="err">{ERR[sp.err] ?? sp.err}</Banner>}

      <form action="/api/attend/rules" method="post" className="space-y-4">
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

        <button className="btn-primary" name="action" value="save">存為新版本 v{ruleSet.version + 1}</button>
      </form>

      <section className="card mt-6">
        <h2 className="mb-3 card-title">假日表（{thisYear} 年，{yearHolidays.length} 筆）</h2>
        <p className="mb-2 text-xs text-gray-500">
          國定假日＝出勤加給；補班日＝強制按平日計。初始資料可用 <code>npx tsx scripts/seed-holidays.ts {slug}</code> 匯入台灣假日。
        </p>
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
