import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb, MEDIA_BUCKET } from '@/db';
import { gsAccess } from '@/org/orgs';

// 一鍵刪除群組全部資料（規劃書第 10 節「可刪除」）
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = String(form.get('group_id') ?? '').trim();
  const back = `${access.base}/groups`;
  if (!groupId || form.get('confirm') !== 'on' || !access.inOrg(groupId)) return redirectTo(back);
  const db = getDb();
  await db.from('embeddings').delete().eq('group_id', groupId);
  await db.from('events').delete().eq('group_id', groupId);
  await db.from('tasks').delete().eq('group_id', groupId);
  await db.from('notes').delete().eq('group_id', groupId);
  await db.from('messages').delete().eq('group_id', groupId); // media_assets 由 FK cascade 帶走
  await db.from('consent_log').delete().eq('group_id', groupId);
  await db.from('groups').delete().eq('group_id', groupId); // 名稱/頭貼/分類一併清除（刪除邊界涵蓋）

  // Storage 原檔逐頁刪除
  for (;;) {
    const { data: files } = await db.storage.from(MEDIA_BUCKET).list(groupId, { limit: 100 });
    if (!files?.length) break;
    await db.storage.from(MEDIA_BUCKET).remove(files.map((f) => `${groupId}/${f.name}`));
  }
  return redirectTo(back);
}
