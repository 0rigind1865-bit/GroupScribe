import { NextRequest, NextResponse } from 'next/server';
import { getDb, MEDIA_BUCKET } from '@/db';
import { redirectTo } from '@/http';
import { getConnector } from '@/core/config';
import { analyzeAsset, mimeOfKind } from '@/core/ingest';

export const maxDuration = 300;

// 補救閥：重跑 pending 媒體解析＋回補群組名稱
export async function POST(req: NextRequest) {
  const db = getDb();
  const { data: assets, error } = await db
    .from('media_assets')
    .select('id, kind, storage_path, messages!inner(group_id, sender_name, created_at)')
    .eq('status', 'pending')
    .limit(20);
  if (error) throw error;

  let done = 0;
  for (const a of assets ?? []) {
    try {
      const { data: blob } = await db.storage.from(MEDIA_BUCKET).download(a.storage_path);
      if (!blob) continue;
      const msg = a.messages as unknown as { group_id: string; sender_name: string | null; created_at: string };
      await analyzeAsset(
        a.id,
        msg.group_id,
        Buffer.from(await blob.arrayBuffer()),
        mimeOfKind(a.kind),
        new Date(msg.created_at),
        msg.sender_name,
      );
      done++;
    } catch (e) {
      console.error('重跑媒體解析失敗', a.id, e);
    }
  }
  // 回補群組名稱：以 groups_view（messages 推導）為基準——純匯入群、歷史群在 groups 表可能沒列。
  // 只處理「從未嘗試過」（groups 無列）者；已嘗試（含 404）不重打，避免對 bot 不在的群無限重試。
  let groupsNamed = 0;
  let groupsMarked = 0;
  const { data: viewRows } = await db.from('groups_view').select('group_id, name, left_at');
  const unnamed = (viewRows ?? []).filter((g: any) => !g.name && !g.left_at);
  if (unnamed.length) {
    const { data: triedRows } = await db
      .from('groups')
      .select('group_id')
      .in('group_id', unnamed.map((g: any) => g.group_id));
    const tried = new Set((triedRows ?? []).map((r: any) => r.group_id));
    const connector = getConnector();
    for (const g of unnamed) {
      if (tried.has(g.group_id)) continue;
      const summary = await connector.resolveGroupSummary?.(g.group_id).catch(() => undefined);
      const row: Record<string, unknown> = { group_id: g.group_id, updated_at: new Date().toISOString() };
      if (summary?.name) {
        row.name = summary.name;
        row.picture_url = summary.pictureUrl ?? null;
        groupsNamed++;
      } else {
        groupsMarked++; // 標記已嘗試（空列），顯示退回 group_id
      }
      await db.from('groups').upsert(row);
    }
  }

  // 從設定頁的表單按下來的：導回設定頁，別丟一頁 JSON 給人看（curl 呼叫維持 JSON）
  if ((req.headers.get('content-type') ?? '').includes('form'))
    return redirectTo(`/settings?processed=${done}`);
  return NextResponse.json({ pending: (assets ?? []).length, done, groups_named: groupsNamed, groups_marked: groupsMarked });
}
