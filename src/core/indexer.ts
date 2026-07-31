import { getDb } from '@/db';
import { getEmbedding } from './config';

const CHUNK = 1000; // ponytail: 固定長度切塊、無重疊；群組訊息幾乎都遠短於此，OCR 長文才會切

export function chunk(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK) out.push(text.slice(i, i + CHUNK));
  return out;
}

// 單一來源文字 → 切塊 → 向量 → 入庫（created_at 用「訊息時間」，時間加權檢索靠它）
export async function indexText(
  groupId: string,
  sourceType: 'message' | 'media',
  sourceId: string,
  text: string,
  at: Date,
) {
  const emb = getEmbedding();
  const chunks = chunk(text);
  const vectors = await emb.embed(chunks);
  const { error } = await getDb().from('embeddings').insert(
    chunks.map((c, i) => ({
      group_id: groupId,
      source_type: sourceType,
      source_id: sourceId,
      chunk_text: c,
      embedding: vectors[i],
      model_id: emb.modelId,
      created_at: at.toISOString(),
    })),
  );
  if (error) throw error;
}

// 批次版：匯入 / 全量重建用，一次 embed 多則訊息
export async function indexBatch(
  groupId: string,
  items: { sourceType: 'message' | 'media'; sourceId: string; text: string; at: Date }[],
) {
  if (!items.length) return;
  const emb = getEmbedding();
  // ponytail: 批次路徑直接截斷超長文字不切塊；一般聊天訊息碰不到這個上限
  const vectors = await emb.embed(items.map((it) => it.text.slice(0, CHUNK)));
  const { error } = await getDb().from('embeddings').insert(
    items.map((it, i) => ({
      group_id: groupId,
      source_type: it.sourceType,
      source_id: it.sourceId,
      chunk_text: it.text.slice(0, CHUNK),
      embedding: vectors[i],
      model_id: emb.modelId,
      created_at: it.at.toISOString(),
    })),
  );
  if (error) throw error;
}
