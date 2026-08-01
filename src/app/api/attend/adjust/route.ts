import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { activeEmployee } from '@/attend/auth';

// 補卡申請（對等舊 action=adjustPunch，語意修正）：申請進 adjustment_requests 獨立表，
// 核准（/api/attend/review）才落地成 punch_records——舊系統把待審卡直接寫進打卡表，
// 未審核的卡會混進工時計算。
//
// datetime 由 <input type="datetime-local"> 送來（無時區資訊），依台北時區解讀——
// 部署已固定 TZ=Asia/Taipei（.env.example），new Date('YYYY-MM-DDTHH:MM') 即台北牆鐘時間。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const type = String(form.get('type') ?? '');
  const datetime = String(form.get('datetime') ?? '');
  const reason = String(form.get('reason') ?? '').trim() || null;
  if ((type !== 'in' && type !== 'out') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(datetime)) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 });
  }

  const when = new Date(datetime);
  const now = new Date();
  // 允許範圍：上個月 1 號起、不晚於現在（舊制只限當月——月初補上月月底的卡是真實需求，放寬一個月）
  const floor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (isNaN(when.getTime()) || when > now || when < floor) {
    return redirectTo('/a/adjust?err=ERR_ADJUST_RANGE');
  }

  const emp = await activeEmployee();
  if (!emp) return redirectTo('/a?err=ERR_SESSION');

  const { error } = await getDb().from('adjustment_requests').insert({
    org_id: emp.org_id,
    employee_id: emp.id,
    type,
    requested_at: when.toISOString(),
    reason,
  });
  if (error) {
    console.error('adjust 寫入失敗', error);
    return redirectTo('/a/adjust?err=ERR_WRITE');
  }
  return redirectTo('/a/adjust?ok=1');
}
