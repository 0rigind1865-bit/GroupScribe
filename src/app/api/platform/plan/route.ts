import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { isPlatformOwner } from '@/org/orgs';
import { isPlanId, PLAN_LIMITS } from '@/org/plans';

// 平台擁有者手動改某家公司的方案（PAYUNi 串接前的升級方式）：
// 方案決定群組上限與每月 AI 額度；有效日選填（付費方案到期日）。
export async function POST(req: NextRequest) {
  if (!(await isPlatformOwner())) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const form = await req.formData();
  const orgId = String(form.get('org_id') ?? '');
  const plan = String(form.get('plan') ?? '');
  const paidUntil = String(form.get('paid_until') ?? '');
  if (!orgId || !isPlanId(plan)) return redirectTo('/platform?err=1');

  const lim = PLAN_LIMITS[plan];
  const { error } = await getDb()
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        plan,
        max_groups: lim.groups,
        monthly_ai_calls: lim.aiCalls,
        paid_until: /^\d{4}-\d{2}-\d{2}$/.test(paidUntil) ? paidUntil : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    );
  if (error) {
    console.error('改方案失敗', orgId, error);
    return redirectTo('/platform?err=1');
  }
  return redirectTo('/platform?ok=1');
}
