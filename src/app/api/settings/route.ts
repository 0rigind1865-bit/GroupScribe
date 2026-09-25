import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { invalidateSettings } from '@/core/settings';
import { gsAccess } from '@/org/orgs';

// 設定分兩種（商業計劃 G1）：
//   進群告知 → 每家公司各一份（org_settings），該 org 管理員自己改
//   AI 模型／預算 → 全站共用同一把 Gemini 金鑰與同一個向量空間，本質是平台設定，留在 app_settings、只有平台擁有者能改
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `${access.base}/settings`;
  const platformOnly = form.has('ai') || form.has('monthly_budget');
  if (platformOnly && access.via !== 'platform') return NextResponse.json({ error: '沒有權限' }, { status: 403 });

  // AI 設定（migration 011）：模型與免費層上限。金鑰不走這條，永遠只讀環境變數。
  if (form.has('ai')) {
    const model = String(form.get('gen_model') ?? '').trim();
    const free = Number(form.get('ai_daily_free_calls'));
    const { error } = await getDb().from('app_settings').upsert({
      id: 1,
      gen_model: model || null, // 空＝回退到環境變數/程式預設
      ai_daily_free_calls: Number.isFinite(free) && free > 0 ? Math.round(free) : null,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('儲存 AI 設定失敗', error);
    invalidateSettings(); // 不等 30 秒 TTL，下一次 AI 呼叫就吃新模型
    return redirectTo(error ? `${back}?error=ai` : `${back}?saved=1`);
  }

  // 用量卡片的「儲存預算」表單：只動 monthly_budget_usd，不碰告知設定
  if (form.has('monthly_budget')) {
    const budget = Number(form.get('monthly_budget'));
    const { error } = await getDb()
      .from('app_settings')
      .upsert({ id: 1, monthly_budget_usd: Number.isFinite(budget) && budget > 0 ? budget : null, updated_at: new Date().toISOString() });
    if (error) console.error('儲存預算失敗', error);
    return redirectTo(error ? `${back}?error=budget` : `${back}?saved=1`);
  }

  const enabled = form.get('enabled') === 'on'; // checkbox 未勾選則不送
  const text = String(form.get('text') ?? '').trim() || null; // 空則存 null（進群時 fallback 內建預設）
  const { error } = await getDb().from('org_settings').upsert(
    { org_id: access.org.id, join_notice_enabled: enabled, join_notice_text: text, updated_at: new Date().toISOString() },
    { onConflict: 'org_id' },
  );
  if (error) console.error('儲存設定失敗', error);
  return redirectTo(error ? `${back}?error=1` : `${back}?saved=1`);
}
