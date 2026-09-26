import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { moduleAccess } from '@/org/orgs';
import { liffUser } from '@/core/liff';
import { currentRuleSet, parseRules } from '@/attend/rules-store';
import { runDayScript } from '@/attend/sandbox';
import { DEFAULT_RULES } from '@/attend/rules-default';

// 薪資規則管理：存新版本（append-only）＋ 假日增刪。
// 存檔前先用沙箱對一筆樣本資料試跑腳本——爛腳本在存檔當下就被擋下，
// 而不是等到月結才發現（失敗必須可見，且愈早愈好）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const action = String(form.get('action') ?? 'save');

  const access = await moduleAccess(slug, 'attend');
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `/o/${slug}/attend/rules`;
  const db = getDb();

  // ── 假日增刪 ──
  if (action === 'holiday_add') {
    const day = String(form.get('day') ?? '');
    const kind = String(form.get('kind') ?? 'national');
    const name = String(form.get('name') ?? '').trim() || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !['national', 'workday_override'].includes(kind)) {
      return redirectTo(`${back}?err=ERR_HOLIDAY_PARAMS`);
    }
    await db.from('holidays').upsert({ org_id: access.org.id, day, kind, name }, { onConflict: 'org_id,day' });
    return redirectTo(`${back}?tab=holidays`);
  }
  if (action === 'holiday_del') {
    const day = String(form.get('day') ?? '');
    await db.from('holidays').delete().eq('org_id', access.org.id).eq('day', day);
    return redirectTo(`${back}?tab=holidays`);
  }

  // ── 存規則新版本 ──
  const rulesJson = String(form.get('rules') ?? '');
  const script = String(form.get('script') ?? '').trim() || null;
  const scriptEnabled = form.get('script_enabled') === 'on' && !!script;

  const rules = parseRules(rulesJson);
  if (!rules) return redirectTo(`${back}?err=ERR_RULES_INVALID`);

  if (scriptEnabled && script) {
    // 樣本試跑：平日 09:00–19:00、月薪 30000
    const trial = await runDayScript(script, {
      date: '2026-01-05',
      dayType: 'normal',
      weekday: 1,
      punches: [
        { type: 'in', time: '09:00' },
        { type: 'out', time: '19:00' },
      ],
      inTime: '09:00',
      outTime: '19:00',
      netMinutes: 540,
      breakMinutes: 60,
      hourlyRate: 30000 / rules.baseDivisor,
      monthlySalary: 30000,
      rules,
    });
    if ('error' in trial) {
      return redirectTo(`${back}?err=ERR_SCRIPT&msg=${encodeURIComponent(trial.error.slice(0, 180))}`);
    }
  }

  const cur = await currentRuleSet(access.org.id);
  const { error } = await db.from('salary_rule_sets').insert({
    org_id: access.org.id,
    version: cur.version + 1,
    rules: rules satisfies typeof DEFAULT_RULES,
    script,
    script_enabled: scriptEnabled,
    created_by: (await liffUser()) ?? null,
  });
  if (error) {
    console.error('rules 存檔失敗', error);
    return redirectTo(`${back}?err=ERR_WRITE`);
  }
  return redirectTo(`${back}?ok=1`);
}
