import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';
import type { DayPay, DayType, MonthDayInput, MonthResult, SalaryRules } from './salary';
import { computeDay, computeMonth, determineDayType, effectiveMinutes } from './salary';

// 薪資引擎第二層：租戶自訂腳本的沙箱（quickjs-emscripten，WASM）。
//
// 選型理由（本專案唯一新增的 production 依賴，違反極簡原則的代價已比較過）：
//   isolated-vm＝native addon，Docker 要裝編譯鏈、Node 升版要重編——單機小容器的持續稅；
//   SES＝同一個 V8 isolate，沒有 CPU/記憶體上限，while(true) 直接掛掉唯一一台機器
//   （fly.toml max_machines_running=1 讓這是致命的）；
//   quickjs-emscripten＝純 WASM 零編譯、setMemoryLimit + interrupt handler、
//   無 IO/無網路的確定性環境、只有 JSON 進出的真隔離邊界。
//
// 失敗語意（計畫定案）：腳本丟出/逾時/輸出不符 schema → 回退第一層結構化規則，
// 錯誤浮到管理端月曆頁（不靜默）。

export type ScriptDayInput = {
  date: string;
  dayType: DayType;
  weekday: number; // 0=日
  punches: { type: 'in' | 'out'; time: string }[];
  inTime: string;
  outTime: string;
  netMinutes: number;
  breakMinutes: number;
  hourlyRate: number;
  monthlySalary: number;
  rules: SalaryRules;
};

export type ScriptDayOutput = {
  pay: number;
  normalHours: number;
  overtimeHours: number;
  breakdown: { label: string; hours: number; amount: number }[];
};

const MEM_LIMIT = 32 * 1024 * 1024; // 32MB
const DEADLINE_MS = 100; // 單日計算的中斷預算

let qjs: QuickJSWASMModule | null = null;

/** 輸出驗證：有限、非負、sanity cap（pay ≤ 時薪 × 24h × 10 倍）。不合格＝回退。 */
function validate(out: unknown, hourlyRate: number): ScriptDayOutput | null {
  if (typeof out !== 'object' || out === null) return null;
  const o = out as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!num(o.pay) || !num(o.normalHours) || !num(o.overtimeHours)) return null;
  if ((o.pay as number) > hourlyRate * 24 * 10) return null;
  if (!Array.isArray(o.breakdown)) return null;
  for (const l of o.breakdown) {
    if (typeof l !== 'object' || l === null) return null;
    const line = l as Record<string, unknown>;
    if (typeof line.label !== 'string' || !num(line.hours) || typeof line.amount !== 'number' || !Number.isFinite(line.amount)) return null;
  }
  return {
    pay: +(o.pay as number).toFixed(2),
    normalHours: o.normalHours as number,
    overtimeHours: o.overtimeHours as number,
    breakdown: (o.breakdown as ScriptDayOutput['breakdown']).map((l) => ({
      label: String(l.label).slice(0, 200),
      hours: l.hours,
      amount: +l.amount.toFixed(2),
    })),
  };
}

/** 在沙箱執行單日腳本。任何失敗回 { error }，由呼叫端回退結構化規則。 */
export async function runDayScript(
  script: string,
  input: ScriptDayInput,
): Promise<{ result: ScriptDayOutput } | { error: string }> {
  if (!qjs) qjs = await getQuickJS();
  const runtime = qjs.newRuntime();
  try {
    runtime.setMemoryLimit(MEM_LIMIT);
    const deadline = Date.now() + DEADLINE_MS;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const vm = runtime.newContext();
    try {
      // ctx 以 JSON 注入（唯一輸入）；腳本的最後一個運算式即輸出
      const code = `const ctx = ${JSON.stringify(input)};\n${script}`;
      const handle = vm.evalCode(code);
      if (handle.error) {
        const err = vm.dump(handle.error);
        handle.error.dispose();
        return { error: typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err) };
      }
      const out = vm.dump(handle.value);
      handle.value.dispose();
      const valid = validate(out, input.hourlyRate);
      return valid ? { result: valid } : { error: '腳本輸出不符合格式（需要 { pay, normalHours, overtimeHours, breakdown[] }，且數值須有限、非負、未超過上限）' };
    } finally {
      vm.dispose();
    }
  } catch (e) {
    return { error: String(e) };
  } finally {
    runtime.dispose();
  }
}

export type HybridResult = MonthResult & {
  scriptErrors: { date: string; error: string }[]; // 非空＝有日子回退了結構化規則（管理端要顯示）
};

/** 整月計算：有腳本先走沙箱、失敗回退結構化規則；無腳本＝純結構化規則。 */
export async function computeMonthHybrid(
  days: MonthDayInput[],
  monthlySalary: number,
  rules: SalaryRules,
  script?: string | null,
): Promise<HybridResult> {
  const base = computeMonth(days, monthlySalary, rules);
  if (!script) return { ...base, scriptErrors: [] };

  const hourlyRate = monthlySalary / rules.baseDivisor;
  const scriptErrors: { date: string; error: string }[] = [];
  const outDays: MonthResult['days'] = [];
  let extra = 0;
  const totals = { normalHours: 0, overtimeHours: 0, restHours: 0, netHours: 0, grossHours: 0 };

  for (const d of days) {
    if (!d.inTime || !d.outTime) continue;
    const dayType = determineDayType(d.date, d.holidayKind, rules);
    const { netMinutes, breakMinutes } = effectiveMinutes(d.inTime, d.outTime, rules.breaks);
    const fallback = computeDay(d.inTime, d.outTime, dayType, monthlySalary, rules);

    let day: DayPay = fallback;
    const run = await runDayScript(script, {
      date: d.date,
      dayType,
      weekday: new Date(`${d.date}T00:00:00Z`).getUTCDay(),
      punches: [
        { type: 'in', time: d.inTime },
        { type: 'out', time: d.outTime },
      ],
      inTime: d.inTime,
      outTime: d.outTime,
      netMinutes,
      breakMinutes,
      hourlyRate,
      monthlySalary,
      rules,
    });
    if ('result' in run) {
      day = {
        pay: run.result.pay,
        normalHours: run.result.normalHours,
        overtimeHours: run.result.overtimeHours,
        restHours: fallback.restHours,
        netHours: fallback.netHours,
        breakdown: run.result.breakdown.map((l) => ({ ...l, rate: null })),
      };
    } else {
      scriptErrors.push({ date: d.date, error: run.error });
    }

    extra += day.pay;
    totals.normalHours += day.normalHours;
    totals.overtimeHours += day.overtimeHours;
    totals.restHours += day.restHours;
    totals.netHours += day.netHours;
    outDays.push({ ...day, date: d.date, dayType, inTime: d.inTime, outTime: d.outTime });
  }

  totals.grossHours = totals.netHours + totals.restHours;
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = +totals[k].toFixed(2);
  extra = +extra.toFixed(2);
  return {
    base: monthlySalary,
    extra,
    total: +(monthlySalary + extra).toFixed(2),
    hourlyRate: +hourlyRate.toFixed(4),
    totals,
    days: outDays,
    scriptErrors,
  };
}
