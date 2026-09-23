import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { invalidateSettings } from '@/core/settings';
import { gsAccess } from '@/org/orgs';

// 儲存全域設定（進群告知訊息與開關）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  // ponytail: app_settings 仍是全站單列（商業計劃 G1 才遷 org_settings），先只讓平台擁有者改；
  // G1 完成後改成 org 管理員也能改自己 org 的
  if (!access || access.via !== 'platform') return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `${access.base}/settings`;

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
  const { error } = await getDb()
    .from('app_settings')
    .upsert({ id: 1, join_notice_enabled: enabled, join_notice_text: text, updated_at: new Date().toISOString() });
  if (error) console.error('儲存設定失敗', error);
  return redirectTo(error ? `${back}?error=1` : `${back}?saved=1`);
}
