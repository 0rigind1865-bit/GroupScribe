import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate } from './date';

// 反向連結（Obsidian backlinks 等價物）：只走「共享來源訊息」這條確定性硬連結。
// 刻意不碰兩種弱訊號：
//   - embeddings 語意相似：向量是 message/media 粒度、為問答調時間衰減，當「項目↔項目」關聯是雜訊，
//     且項目本身沒被 index（indexer.ts 只收 message/media），根本查不到。
//   - 時間鄰近：工作群同一時段夾雜大量無關訊息，建立時間近推不出關聯。
// ponytail: source_message_ids 無 GIN 索引。查詢一律先以 group_id 收窄到單群數十~數百列，
//           其上做陣列重疊（&&）的 seq scan 成本可忽略。單群項目破千或查詢變慢再加：
//             create index on events using gin (source_message_ids);（tasks/notes 同）
//           —— 屬 schema 變更、需手動重跑 SQL，YAGNI，現在不動。

export type RelatedType = 'event' | 'task' | 'note';

export type RelatedItem = {
  type: RelatedType;
  id: string;
  tag: string; // 顯示用類型標籤：事件 / 待辦 / 公告 / 決議
  title: string;
  label: string; // 副標：事件=日期、待辦=負責人/期限、公告決議=空
  href: string; // 已建好的詳情連結
  sourceMessageIds: string[]; // 供「單一訊息衍生了哪些項目」的反查（呼叫端可選用）
  shared: number; // 與來源共享的訊息則數，排序用（越多＝越可能同一件事）
};

// 給定某項目的 source_message_ids，找出同群、與它共享任一來源訊息的其他 event/task/note。
// 對應 Postgres 陣列重疊運算子 &&（supabase-js 的 .overlaps）。
export async function relatedItems(
  db: SupabaseClient,
  groupId: string,
  sourceIds: string[],
  self: { type: RelatedType; id: string },
): Promise<RelatedItem[]> {
  // 空陣列的 overlaps 恆假、也無意義：直接短路
  if (!sourceIds.length) return [];
  const g = encodeURIComponent(groupId);
  const overlap = (t: string, cols: string) =>
    db
      .from(t)
      .select(cols)
      .eq('group_id', groupId)
      .overlaps('source_message_ids', sourceIds)
      .neq('status', 'ignored'); // 三表皆有 status；已忽略的不算相關

  const [ev, tk, nt] = await Promise.all([
    overlap('events', 'id, title, starts_at, source_message_ids'),
    overlap('tasks', 'id, title, assignee, due_at, source_message_ids'),
    overlap('notes', 'id, title, kind, source_message_ids'),
  ]);

  const src = new Set(sourceIds);
  const shared = (ids: string[] | null) => (ids ?? []).filter((x) => src.has(x)).length;

  const out: RelatedItem[] = [];
  for (const e of (ev.data ?? []) as any[]) {
    out.push({
      type: 'event',
      id: e.id,
      tag: '事件',
      title: e.title,
      label: e.starts_at ?? '',
      href: `/calendar?group=${g}&date=${e.starts_at}&event=${e.id}`,
      sourceMessageIds: e.source_message_ids ?? [],
      shared: shared(e.source_message_ids),
    });
  }
  for (const t of (tk.data ?? []) as any[]) {
    out.push({
      type: 'task',
      id: t.id,
      tag: '待辦',
      title: t.title,
      label: [t.assignee, t.due_at && `期限 ${fmtDate(t.due_at)}`].filter(Boolean).join('・'),
      href: `/tasks?group=${g}&task=${t.id}`,
      sourceMessageIds: t.source_message_ids ?? [],
      shared: shared(t.source_message_ids),
    });
  }
  for (const n of (nt.data ?? []) as any[]) {
    out.push({
      type: 'note',
      id: n.id,
      tag: n.kind === 'decision' ? '決議' : '公告',
      title: n.title,
      label: '',
      href: `/notes?group=${g}&note=${n.id}`,
      sourceMessageIds: n.source_message_ids ?? [],
      shared: shared(n.source_message_ids),
    });
  }
  // 排除自己；共享則數多者優先
  return out
    .filter((r) => !(r.type === self.type && r.id === self.id))
    .sort((a, b) => b.shared - a.shared);
}
