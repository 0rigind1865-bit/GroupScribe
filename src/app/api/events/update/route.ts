import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';

// 事件操作：confirm（確認無誤）/ ignore（忽略）/ save（人工修正，存檔即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/calendar';

  if (id) {
    const db = getDb();
    const now = new Date().toISOString();
    if (action === 'confirm') {
      await db.from('events').update({ needs_confirmation: false, updated_at: now }).eq('id', id);
    } else if (action === 'ignore') {
      await db.from('events').update({ status: 'ignored', updated_at: now }).eq('id', id);
    } else if (action === 'save') {
      const patch: Record<string, unknown> = { needs_confirmation: false, updated_at: now };
      const title = String(form.get('title') ?? '').trim();
      if (title) patch.title = title;
      const date = String(form.get('date') ?? '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) patch.starts_at = date;
      const time = String(form.get('time') ?? '');
      patch.start_time = /^\d{2}:\d{2}/.test(time) ? time : null; // 清空欄位 = 移除時間
      patch.location = String(form.get('location') ?? '').trim() || null;
      patch.note = String(form.get('note') ?? '').trim() || null;
      await db.from('events').update(patch).eq('id', id);
    }
  }
  return redirectTo(back);
}
