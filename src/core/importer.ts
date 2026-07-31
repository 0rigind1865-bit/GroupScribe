import { getDb } from '@/db';
import { getChannelId, isLowInfo, label } from './ingest';
import { indexBatch } from './indexer';

// LINE 聊天記錄 txt 匯入（規劃書 4.2 冷啟動對策）
// 格式：日期行（2026/07/01（三））＋訊息行（時間<TAB>暱稱<TAB>訊息），多行訊息為續行

export interface ParsedLine {
  at: Date;
  sender: string;
  text: string;
}

// 日期行必須「整行只有日期＋可選星期」，避免把訊息續行裡的日期誤判成日期行
const DATE_RE = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})\s*(（.+）|\(.+\)|星期.+)?$/;
const MSG_RE = /^(上午|下午)?(\d{1,2}):(\d{2})\t([^\t]*)\t(.*)$/;

export function parseLineExport(txt: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let ymd: [number, number, number] | null = null;

  for (const line of txt.split(/\r?\n/)) {
    const d = line.match(DATE_RE);
    if (d) {
      ymd = [+d[1], +d[2], +d[3]];
      continue;
    }
    const m = line.match(MSG_RE);
    if (m && ymd) {
      let h = +m[2];
      if (m[1] === '下午' && h < 12) h += 12;
      if (m[1] === '上午' && h === 12) h = 0;
      // 以伺服器時區解讀（部署時設 TZ=Asia/Taipei）
      out.push({ at: new Date(ymd[0], ymd[1] - 1, ymd[2], h, +m[3]), sender: m[4], text: m[5] });
      continue;
    }
    // 續行：多行訊息接回上一則；檔頭（[LINE]…、儲存日期：…）落在 ymd 尚未設定時，自然被跳過
    if (out.length && ymd && line.trim()) out[out.length - 1].text += '\n' + line;
  }
  return out;
}

// 匯入的舊訊息只當「群組理解」的素材：窗外的直接標為已處理，不進抽取隊列。
// 理由有二——去年的「星期三來搬東西」變成今天的待辦是噪音；且整批歷史送 LLM 是最貴的一筆帳。
// 索引照建，問答與群組歸納仍讀得到（migration 010 對既有資料做了同政策回填）。
const EXTRACT_WINDOW_DAYS = 30;
export const inExtractWindow = (at: Date, now = Date.now()) =>
  at.getTime() >= now - EXTRACT_WINDOW_DAYS * 86_400_000;

export async function importChat(
  groupId: string,
  txt: string,
): Promise<{ inserted: number; indexed: number; archived: number }> {
  const parsed = parseLineExport(txt);
  const db = getDb();
  const channelId = await getChannelId();
  const now = Date.now();
  let inserted = 0;
  let indexed = 0;
  let archived = 0;

  // ponytail: txt 沒有訊息 ID 可去重，重複匯入會重複入庫；UI 已註明重匯前先刪群組資料
  for (let i = 0; i < parsed.length; i += 200) {
    const batch = parsed.slice(i, i + 200);
    const { data, error } = await db
      .from('messages')
      .insert(
        batch.map((p) => ({
          channel_id: channelId,
          group_id: groupId,
          sender_name: p.sender, // 暱稱與 userId 的對應之後再做（規劃書 4.2 已知限制）
          type: 'text',
          text: p.text,
          is_low_info: isLowInfo(p.text),
          source: 'import',
          created_at: p.at.toISOString(),
          // 窗外＝視同抽過（不排隊、不燒 LLM）；窗內留 null，照常進抽取隊列
          extracted_at: inExtractWindow(p.at, now) ? null : new Date(now).toISOString(),
        })),
      )
      .select('id, text, sender_name, created_at, is_low_info, extracted_at');
    if (error) throw error;

    const toIndex = (data ?? [])
      .filter((r) => !r.is_low_info)
      .map((r) => ({
        sourceType: 'message' as const,
        sourceId: r.id,
        text: label(new Date(r.created_at), r.sender_name) + r.text,
        at: new Date(r.created_at),
      }));
    await indexBatch(groupId, toIndex);
    inserted += batch.length;
    indexed += toIndex.length;
    archived += (data ?? []).filter((r) => r.extracted_at).length;
  }
  return { inserted, indexed, archived };
}
