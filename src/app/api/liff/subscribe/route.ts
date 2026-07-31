import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { isGroupMember, liffUser } from '@/core/liff';

// 成員自行訂閱／取消每日摘要（計劃 B.8：consent 落在個人層級）。
// 與 /api/liff/item 同一套把關：有效 session → 確為該群成員 → 只能動自己的訂閱。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const groupId = String(form.get('group_id') ?? '').trim();
  const on = String(form.get('enabled') ?? '') === 'on';
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith('/g/') && !backRaw.startsWith('//') ? backRaw : `/g/${encodeURIComponent(groupId)}`;

  const uid = await liffUser();
  if (!uid) return NextResponse.json({ error: '請重新開啟 LIFF' }, { status: 401 });
  if (!groupId) return NextResponse.json({ error: '缺 group_id' }, { status: 400 });
  if (!(await isGroupMember(groupId, uid))) return NextResponse.json({ error: '沒有這個群組的權限' }, { status: 403 });

  const { error } = await getDb().from('push_subscriptions').upsert({
    group_id: groupId,
    line_user_id: uid, // 只能寫自己的：uid 來自伺服器驗證過的 session，不吃表單值
    enabled: on,
    fail_count: 0,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('訂閱設定失敗（migration 009 跑了嗎？）', error);
    return redirectTo(`${back}${back.includes('?') ? '&' : '?'}suberror=1`);
  }
  return redirectTo(back);
}
