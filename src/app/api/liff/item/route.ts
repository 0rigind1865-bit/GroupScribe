import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { isGroupMember, liffUser } from '@/core/liff';

// LIFF v2 成員寫入（計劃 B.3）：權限規則只有一條——A 群成員只能動 A 群資料。
// 三重保護：(1) 有效的 LIFF session（LINE ID token 換來的）(2) 該 userId 確實是該群成員
// (3) 目標項目必須屬於同一個 group_id（查詢時就綁死，跨群 id 一律找不到）。
// 刪除群組資料與跨群聚合永遠 admin-only，此端點只做 confirm / ignore / save。
const TABLE = { event: 'events', task: 'tasks', note: 'notes' } as const;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const kind = String(form.get('kind') ?? '') as keyof typeof TABLE;
  const table = TABLE[kind];
  const id = String(form.get('id') ?? '').trim();
  const groupId = String(form.get('group_id') ?? '').trim();
  const action = String(form.get('action') ?? '');
  // 回跳到操作前的分頁；只接受 /g/ 底下的相對路徑（防 open redirect）
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/g/') && !backRaw.startsWith('//') ? backRaw : `/g/${encodeURIComponent(groupId)}`;

  const uid = await liffUser();
  if (!uid) return NextResponse.json({ error: '請重新開啟 LIFF' }, { status: 401 });
  if (!table || !id || !groupId) return NextResponse.json({ error: '參數不足' }, { status: 400 });
  if (!(await isGroupMember(groupId, uid))) return NextResponse.json({ error: '沒有這個群組的權限' }, { status: 403 });

  const db = getDb();
  // group_id 綁進查詢：別群的 id 在這裡就找不到，不必額外比對
  const { data: item } = await db.from(table).select('id').eq('id', id).eq('group_id', groupId).maybeSingle();
  if (!item) return NextResponse.json({ error: '找不到項目' }, { status: 404 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now, edited_by: uid };

  if (action === 'confirm') {
    patch.needs_confirmation = false;
  } else if (action === 'done' && kind === 'task') {
    // 「任務做完了」這個知識天生在做的人身上，不該等管理者關單（審查 P1）
    patch.status = 'done';
    patch.needs_confirmation = false;
  } else if (action === 'reopen' && kind === 'task') {
    patch.status = 'open';
  } else if (action === 'ignore') {
    patch.status = 'ignored';
  } else if (action === 'save') {
    // 成員修正即視為已確認（與管理版同一套慣例）
    patch.needs_confirmation = false;
    const title = String(form.get('title') ?? '').trim();
    if (title) patch.title = title;
    if (kind === 'event') {
      const date = String(form.get('date') ?? '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) patch.starts_at = date;
      const time = String(form.get('time') ?? '');
      patch.start_time = /^\d{2}:\d{2}/.test(time) ? time : null; // 清空 = 移除時間
      patch.location = String(form.get('location') ?? '').trim() || null;
    } else if (kind === 'task') {
      patch.assignee = String(form.get('assignee') ?? '').trim() || null;
      const due = String(form.get('due') ?? '');
      patch.due_at = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
    } else {
      patch.body = String(form.get('body') ?? '').trim() || null;
    }
  } else {
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  }

  let { error } = await db.from(table).update(patch).eq('id', id).eq('group_id', groupId);
  if (error && /edited_by/.test(error.message)) {
    // migration 008 未跑：功能照常，只是不記錄修改者（與 profile/project 欄位同一套降級慣例）
    console.warn('edited_by 欄位未建（migration 008），本次不記錄修改者');
    delete patch.edited_by;
    ({ error } = await db.from(table).update(patch).eq('id', id).eq('group_id', groupId));
  }
  if (error) {
    console.error('LIFF 成員寫入失敗', kind, action, error);
    return redirectTo(`${back}${back.includes('?') ? '&' : '?'}error=1`);
  }
  return redirectTo(back);
}
