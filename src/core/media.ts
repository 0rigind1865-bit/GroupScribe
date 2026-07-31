import type { SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_BUCKET } from '@/db';

// 項目 ↔ 照片：抽取只讀文字訊息，圖片是獨立的一則訊息，兩者沒有直接的 id 關聯。
// 唯一可靠的橋是「同一段對話」——照片與「這裡要補砂漿」通常相隔數秒到數分鐘。
// 故以來源訊息的時間窗配對，UI 誠實標為「同時段」而非斷言是該項目的附件。
// ponytail: 時間窗啟發式，先跑真實資料看準度；要更準的路是把 vision_summary 餵進抽取
// prompt 讓 AI 自己把圖片訊息列為 source_ref（計劃 D 表「媒體內容進抽取」，僅對新訊息生效）。

const WINDOW_MS = 10 * 60_000;
const MAX_PER_ITEM = 4;

export interface ItemMedia {
  id: string;
  kind: string;
  url: string;
  at: string;
}

export async function mediaForItems(
  db: SupabaseClient,
  groupId: string,
  items: { id: string; sourceIds: string[] | null | undefined }[],
): Promise<Map<string, ItemMedia[]>> {
  const out = new Map<string, ItemMedia[]>();
  const allSrc = [...new Set(items.flatMap((i) => i.sourceIds ?? []))];
  if (!allSrc.length) return out;

  const { data: srcMsgs } = await db.from('messages').select('id, created_at').in('id', allSrc);
  const timeOf = new Map((srcMsgs ?? []).map((m: any) => [m.id, new Date(m.created_at).getTime()]));
  if (!timeOf.size) return out;

  // media_assets 無 group_id，透過 messages inner join；單群量小，一次撈完在 JS 配對
  const { data: assets } = await db
    .from('media_assets')
    .select('id, kind, storage_path, messages!inner(group_id, created_at)')
    .eq('messages.group_id', groupId);
  if (!assets?.length) return out;

  const need = new Set<string>();
  const perItem = new Map<string, any[]>();
  for (const it of items) {
    const times = (it.sourceIds ?? []).map((id) => timeOf.get(id)).filter((t): t is number => typeof t === 'number');
    if (!times.length) continue;
    const hits = (assets as any[])
      .filter((a) => {
        const at = new Date(a.messages.created_at).getTime();
        return times.some((t) => Math.abs(at - t) <= WINDOW_MS);
      })
      .slice(0, MAX_PER_ITEM);
    if (hits.length) {
      perItem.set(it.id, hits);
      for (const h of hits) need.add(h.storage_path);
    }
  }
  if (!need.size) return out;

  // 私有 bucket → 一次批次簽名（1 小時）
  const { data: signed } = await db.storage.from(MEDIA_BUCKET).createSignedUrls([...need], 3600);
  const urlOf = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path!, s.signedUrl!]));

  for (const [itemId, hits] of perItem) {
    const list = hits
      .map((h) => ({ id: h.id, kind: h.kind, url: urlOf.get(h.storage_path) ?? '', at: h.messages.created_at }))
      .filter((m) => m.url);
    if (list.length) out.set(itemId, list);
  }
  return out;
}
