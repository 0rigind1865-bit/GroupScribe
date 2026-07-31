import { getDb } from '@/db';
import { getLLM } from './config';
import { getProfile } from './profile';

// 檔案的專案歸屬分類：AI 依「前後對話上下文＋內容摘要」判斷每個檔案屬於哪個工作專案。
// 觸發：檔案頁「AI 依專案分類」按鈕（費用控制，不自動跑）。判斷不出來存「未分類」，
// 之後不會重複送進 LLM；要重判可在 DB 把 project 清回 null。

const BATCH = 12; // 每次 LLM 呼叫的檔案數
const CTX = 5; // 檔案訊息前後各取幾則對話

type AssetRow = {
  id: string;
  kind: string;
  vision_summary: string | null;
  ocr_text: string | null;
  messages: { sender_name: string | null; created_at: string; text: string | null };
};

export async function classifyFiles(groupId: string): Promise<{ classified: number; total: number }> {
  const db = getDb();
  const res = { classified: 0, total: 0 };

  // 未分類檔案（project 欄位未建＝migration 007 未跑，這裡就會 throw，API 層回報）
  const { data: pending, error } = await db
    .from('media_assets')
    .select('id, kind, vision_summary, ocr_text, messages!inner(group_id, sender_name, created_at, text)')
    .eq('messages.group_id', groupId)
    .is('project', null)
    .order('created_at', { referencedTable: 'messages', ascending: true });
  if (error) throw new Error(`讀取檔案失敗（migration 007 跑了嗎？）：${error.message}`);
  if (!pending?.length) return res;
  res.total = pending.length;

  const profile = await getProfile(groupId);

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH) as unknown as AssetRow[];

    // 既有專案清單每批重查：同一輪前面批次定下的案名，後面批次直接沿用
    const { data: projRows } = await db
      .from('media_assets')
      .select('project, messages!inner(group_id)')
      .eq('messages.group_id', groupId)
      .not('project', 'is', null);
    const known = [...new Set((projRows ?? []).map((r: any) => r.project).filter((p) => p && p !== '未分類'))];

    // 每個檔案抓前後對話脈絡
    const lines: string[] = [];
    const refs = new Map<string, string>();
    for (let j = 0; j < batch.length; j++) {
      const a = batch[j];
      const code = `F${j + 1}`;
      refs.set(code, a.id);
      const at = a.messages.created_at;
      const [{ data: before }, { data: after }] = await Promise.all([
        db.from('messages').select('sender_name, created_at, text').eq('group_id', groupId)
          .lt('created_at', at).not('text', 'is', null).order('created_at', { ascending: false }).limit(CTX),
        db.from('messages').select('sender_name, created_at, text').eq('group_id', groupId)
          .gt('created_at', at).not('text', 'is', null).order('created_at').limit(CTX),
      ]);
      const ctx = [...(before ?? []).reverse(), ...(after ?? [])]
        .filter((m) => m.text?.trim())
        .map((m) => `  [${new Date(m.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} ${m.sender_name ?? '?'}] ${m.text}`);
      lines.push(
        [
          `${code}｜${new Date(at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}｜${a.messages.sender_name ?? '?'}｜${a.kind === 'image' ? '圖片' : a.kind.toUpperCase()}`,
          a.vision_summary ? `  內容摘要：${a.vision_summary}` : '',
          a.ocr_text ? `  OCR 節錄：${a.ocr_text.slice(0, 200)}` : '',
          ctx.length ? `  前後對話：\n${ctx.join('\n')}` : '  前後對話：無',
        ].filter(Boolean).join('\n'),
      );
    }

    const prompt = `你是工作群組的檔案整理助理。根據每個檔案的線索（傳送者、時間、內容摘要、前後對話），判斷它屬於哪個工作專案/案子。

規則：
1. 專案名稱用群組慣用的簡短案名；【既有專案】已有同一案就沿用該名稱，避免同案不同名。
   【群組背景】的「進行中的案子」若指的是同一個案子，就用它的講法——兩份清單要對得起來
   （例：背景寫「中山北路九月底工程」，就不要另外叫「中山北路案」）。
2. 線索不足就填「未分類」，禁止編造。
3. 只輸出 JSON：{"files":[{"ref":"F1","project":"案名"}]}
${profile ? `\n【群組背景】（AI 歸納，僅供理解脈絡）\n${profile}\n` : ''}
【既有專案】
${known.length ? known.join('、') : '無'}

【檔案清單】
${lines.join('\n')}`;

    const raw = await getLLM().generateJson(prompt);
    const files = Array.isArray((raw as any)?.files) ? (raw as any).files : [];
    for (const f of files) {
      const id = typeof f?.ref === 'string' ? refs.get(f.ref) : undefined;
      const project = typeof f?.project === 'string' && f.project.trim() ? f.project.trim().slice(0, 40) : null;
      if (!id || !project) continue;
      const { error: e } = await db.from('media_assets').update({ project }).eq('id', id);
      if (e) console.error('寫入檔案專案失敗', id, e);
      else res.classified++;
    }
  }
  return res;
}
