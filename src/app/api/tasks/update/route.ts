import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { gsAccess } from '@/org/orgs';

// 待辦操作：confirm / done / reopen / ignore / save（人工修正即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : `${access.base}/tasks`;

  if (id) {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> | null =
      action === 'confirm'
        ? { needs_confirmation: false }
        : action === 'done'
          ? { status: 'done', needs_confirmation: false }
          : action === 'reopen'
            ? { status: 'open' }
            : action === 'ignore'
              ? { status: 'ignored' }
              : action === 'save'
                ? {
                    needs_confirmation: false,
                    ...(String(form.get('title') ?? '').trim() ? { title: String(form.get('title')).trim() } : {}),
                    assignee: String(form.get('assignee') ?? '').trim() || null,
                    // 清空欄位 = 移除期限
                    due_at: /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('due') ?? '')) ? String(form.get('due')) : null,
                    note: String(form.get('note') ?? '').trim() || null,
                  }
                : null;
    // 以 id 操作的一律再綁 group_id ∈ 本 org
    if (patch) await getDb().from('tasks').update({ ...patch, updated_at: now }).eq('id', id).in('group_id', access.groupIds);
  }
  return redirectTo(back);
}
