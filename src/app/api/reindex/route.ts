import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getEmbedding } from '@/core/config';
import { indexBatch, indexText } from '@/core/indexer';
import { label } from '@/core/ingest';

export const maxDuration = 300;

// 換 embedding 模型後一鍵全量重建（規劃書 6.2）。原始文字都在庫裡，全刪重建是冪等的。
export async function POST() {
  const db = getDb();
  const emb = getEmbedding();
  await db.from('embeddings').delete().neq('model_id', ''); // model_id 非空 ＝ 全部

  let messages = 0;
  for (let from = 0; ; from += 200) {
    const { data: rows, error } = await db
      .from('messages')
      .select('id, group_id, text, sender_name, created_at')
      .eq('type', 'text')
      .eq('is_low_info', false)
      .not('text', 'is', null)
      .order('id')
      .range(from, from + 199);
    if (error) throw error;
    if (!rows?.length) break;

    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byGroup.get(r.group_id) ?? [];
      list.push(r);
      byGroup.set(r.group_id, list);
    }
    for (const [gid, list] of byGroup) {
      await indexBatch(
        gid,
        list.map((r) => ({
          sourceType: 'message' as const,
          sourceId: r.id,
          text: label(new Date(r.created_at), r.sender_name) + r.text,
          at: new Date(r.created_at),
        })),
      );
    }
    messages += rows.length;
    if (rows.length < 200) break;
  }

  let media = 0;
  for (let from = 0; ; from += 200) {
    const { data: rows, error } = await db
      .from('media_assets')
      .select('id, ocr_text, vision_summary, category, messages!inner(group_id, sender_name, created_at)')
      .eq('status', 'done')
      .order('id')
      .range(from, from + 199);
    if (error) throw error;
    if (!rows?.length) break;
    for (const a of rows) {
      const m = a.messages as unknown as { group_id: string; sender_name: string | null; created_at: string };
      const text = [a.vision_summary, a.ocr_text].filter(Boolean).join('\n');
      if (!text) continue;
      await indexText(
        m.group_id,
        'media',
        a.id,
        `${label(new Date(m.created_at), m.sender_name)}[${a.category ?? '其他'}] ${text}`,
        new Date(m.created_at),
      );
      media++;
    }
    if (rows.length < 200) break;
  }

  return NextResponse.json({ model_id: emb.modelId, reindexed_messages: messages, reindexed_media: media });
}
