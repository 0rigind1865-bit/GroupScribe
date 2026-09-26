import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { moduleAccess } from '@/org/orgs';
import { liffUser } from '@/core/liff';
import { workDate } from '@/attend/util';

// 補卡審核（對等舊 approveReview / rejectReview）。核准＝插入 punch_record 並回填申請列。
// Supabase JS 無交易：先插卡、再回填；回填失敗即刪卡回滾，兩邊都失敗才會留孤兒
// （機率極低，且 punch_record_id 缺值可人工對帳）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  if (!slug || !id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 });
  }

  const access = await moduleAccess(slug, 'attend');
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `/o/${slug}/attend/reviews`;

  const db = getDb();
  // org_id 綁進查詢：別 org 的申請 id 在這裡就找不到
  const { data: reqRow } = await db
    .from('adjustment_requests')
    .select('id, employee_id, type, requested_at, reason, status')
    .eq('id', id)
    .eq('org_id', access.org.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (!reqRow) return redirectTo(`${back}?err=ERR_REVIEW_GONE`);

  const reviewer = (await liffUser()) ?? null; // 平台擁有者走密碼 session 時為 null

  if (action === 'reject') {
    await db
      .from('adjustment_requests')
      .update({ status: 'rejected', reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', access.org.id);
    return redirectTo(`${back}?ok=rejected`);
  }

  const when = new Date(reqRow.requested_at);
  const { data: punch, error: insErr } = await db
    .from('punch_records')
    .insert({
      org_id: access.org.id,
      employee_id: reqRow.employee_id,
      type: reqRow.type,
      punched_at: reqRow.requested_at,
      work_date: workDate(when),
      source: 'adjustment',
      note: reqRow.reason,
    })
    .select('id')
    .single();
  if (insErr || !punch) {
    console.error('review 插卡失敗', insErr);
    return redirectTo(`${back}?err=ERR_WRITE`);
  }

  const { error: updErr } = await db
    .from('adjustment_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      punch_record_id: punch.id,
    })
    .eq('id', id)
    .eq('org_id', access.org.id);
  if (updErr) {
    await db.from('punch_records').delete().eq('id', punch.id); // 回滾
    console.error('review 回填失敗', updErr);
    return redirectTo(`${back}?err=ERR_WRITE`);
  }
  return redirectTo(`${back}?ok=approved`);
}
