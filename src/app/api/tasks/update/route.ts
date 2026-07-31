import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';

// 待辦操作：confirm / done / reopen / ignore / save（人工修正即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/tasks';

  if (id) {
    const db = getDb();
    const now = new Date().toISOString();
    if (action === 'confirm') {
      await db.from('tasks').update({ needs_confirmation: false, updated_at: now }).eq('id', id);
    } else if (action === 'done') {
      await db.from('tasks').update({ status: 'done', needs_confirmation: false, updated_at: now }).eq('id', id);
    } else if (action === 'reopen') {
      await db.from('tasks').update({ status: 'open', updated_at: now }).eq('id', id);
    } else if (action === 'ignore') {
      await db.from('tasks').update({ status: 'ignored', updated_at: now }).eq('id', id);
    } else if (action === 'save') {
      const patch: Record<string, unknown> = { needs_confirmation: false, updated_at: now };
      const title = String(form.get('title') ?? '').trim();
      if (title) patch.title = title;
      patch.assignee = String(form.get('assignee') ?? '').trim() || null;
      const due = String(form.get('due') ?? '');
      patch.due_at = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null; // 清空欄位 = 移除期限
      patch.note = String(form.get('note') ?? '').trim() || null;
      await db.from('tasks').update(patch).eq('id', id);
    }
  }
  return redirectTo(back);
}
