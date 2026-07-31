import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';

// 公告/決議操作：confirm / ignore / pin / unpin / save（人工修正即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/notes';

  if (id) {
    const db = getDb();
    const now = new Date().toISOString();
    if (action === 'confirm') {
      await db.from('notes').update({ needs_confirmation: false, updated_at: now }).eq('id', id);
    } else if (action === 'ignore') {
      await db.from('notes').update({ status: 'ignored', updated_at: now }).eq('id', id);
    } else if (action === 'restore') {
      await db.from('notes').update({ status: 'active', updated_at: now }).eq('id', id);
    } else if (action === 'pin' || action === 'unpin') {
      await db.from('notes').update({ pinned: action === 'pin', updated_at: now }).eq('id', id);
    } else if (action === 'save') {
      const patch: Record<string, unknown> = { needs_confirmation: false, updated_at: now };
      const title = String(form.get('title') ?? '').trim();
      if (title) patch.title = title;
      const kind = String(form.get('kind') ?? '');
      if (kind === 'announcement' || kind === 'decision') patch.kind = kind;
      patch.body = String(form.get('body') ?? '').trim() || null;
      await db.from('notes').update(patch).eq('id', id);
    }
  }
  return redirectTo(back);
}
