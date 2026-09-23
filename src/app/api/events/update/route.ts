import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { gsAccess } from '@/org/orgs';

// 事件操作：confirm（確認無誤）/ ignore（忽略）/ save（人工修正，存檔即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : `${access.base}/calendar`;

  if (id) {
    const now = new Date().toISOString();
    const date = String(form.get('date') ?? '');
    const time = String(form.get('time') ?? '');
    const patch: Record<string, unknown> | null =
      action === 'confirm'
        ? { needs_confirmation: false }
        : action === 'ignore'
          ? { status: 'ignored' }
          : action === 'save'
            ? {
                needs_confirmation: false,
                ...(String(form.get('title') ?? '').trim() ? { title: String(form.get('title')).trim() } : {}),
                ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { starts_at: date } : {}),
                start_time: /^\d{2}:\d{2}/.test(time) ? time : null, // 清空欄位 = 移除時間
                location: String(form.get('location') ?? '').trim() || null,
                note: String(form.get('note') ?? '').trim() || null,
              }
            : null;
    // 以 id 操作的一律再綁 group_id ∈ 本 org：拿到別家的 id 也改不到
    if (patch) await getDb().from('events').update({ ...patch, updated_at: now }).eq('id', id).in('group_id', access.groupIds);
  }
  return redirectTo(back);
}
