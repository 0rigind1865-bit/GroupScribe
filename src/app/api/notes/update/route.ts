import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { gsAccess } from '@/org/orgs';

// 公告/決議操作：confirm / ignore / restore / pin / unpin / save（人工修正即視為已確認）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : `${access.base}/notes`;

  if (id) {
    const now = new Date().toISOString();
    const kind = String(form.get('kind') ?? '');
    const patch: Record<string, unknown> | null =
      action === 'confirm'
        ? { needs_confirmation: false }
        : action === 'ignore'
          ? { status: 'ignored' }
          : action === 'restore'
            ? { status: 'active' }
            : action === 'pin' || action === 'unpin'
              ? { pinned: action === 'pin' }
              : action === 'save'
                ? {
                    needs_confirmation: false,
                    ...(String(form.get('title') ?? '').trim() ? { title: String(form.get('title')).trim() } : {}),
                    ...(kind === 'announcement' || kind === 'decision' ? { kind } : {}),
                    body: String(form.get('body') ?? '').trim() || null,
                  }
                : null;
    // 以 id 操作的一律再綁 group_id ∈ 本 org
    if (patch) await getDb().from('notes').update({ ...patch, updated_at: now }).eq('id', id).in('group_id', access.groupIds);
  }
  return redirectTo(back);
}
