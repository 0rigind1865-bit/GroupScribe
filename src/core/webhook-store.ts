import { getDb } from '@/db';
import { getConnector } from './config';
import { handleEvent } from './ingest';
import { scheduleExtract } from './schedule';

// webhook 先落地（商業計劃 G4）：驗簽 → 原始事件寫進 webhook_events → 回 200 → 再處理。
// 處理失敗或容器重啟，事件還在表裡，下一次處理（下一個 webhook 或輪詢）會接手。
// 表還沒建（migration 024 未跑）→ 回報 fallback，由 route 走舊路徑直接處理。

type Err = { code?: string; message?: string } | null;
export type WebhookRow = { channel_id: string; webhook_event_id: string | null; is_redelivery: boolean | null; payload: unknown };

/** LINE 原始 body → 每個 event 一列（存原始物件：解析規則之後改了也能重跑） */
export function rawEventRows(body: unknown, channelId: string): WebhookRow[] {
  const events = (body as { events?: unknown[] } | null)?.events ?? [];
  return events.map((ev) => {
    const e = ev as { webhookEventId?: string; deliveryContext?: { isRedelivery?: boolean } };
    return {
      channel_id: channelId,
      webhook_event_id: e.webhookEventId ?? null,
      is_redelivery: e.deliveryContext?.isRedelivery ?? null,
      payload: ev,
    };
  });
}

/** 寫入失敗（任何錯誤，包含表不存在）→ 走舊路徑直接處理，寧可沒有冪等也不能漏訊息 */
export const shouldFallback = (error: Err): boolean => !!error;

type Db = { from: (t: string) => { upsert: (rows: WebhookRow[], o: object) => PromiseLike<{ error: Err }> } };

/** 落地；回 'landed' 或 'fallback'（呼叫端要自己直接處理） */
export async function landWebhook(rows: WebhookRow[], db: Db = getDb() as unknown as Db): Promise<'landed' | 'fallback'> {
  if (!rows.length) return 'landed';
  try {
    const { error } = await db.from('webhook_events').upsert(rows, { onConflict: 'webhook_event_id', ignoreDuplicates: true });
    if (shouldFallback(error)) console.warn('webhook 落地失敗，改直接處理（migration 024 跑了嗎？）', error?.message);
    return shouldFallback(error) ? 'fallback' : 'landed';
  } catch (e) {
    console.warn('webhook 落地失敗，改直接處理', e);
    return 'fallback';
  }
}

// ponytail: 同容器只跑一個處理迴圈；多容器靠 claim 函式的 skip locked。
// 迴圈跑著時又有人叫 → 記一筆 again，跑完再掃一輪（否則剛落地的事件要等下一個 webhook 才處理）
let running = false;
let again = false;
/** 處理所有待處理事件；回處理成功的筆數 */
export async function processPendingWebhooks(): Promise<number> {
  if (running) {
    again = true;
    return 0;
  }
  running = true;
  let done = 0;
  try {
    const db = getDb();
    const connector = getConnector();
    do {
    again = false;
    for (;;) {
      const { data: rows, error } = await db.rpc('claim_webhook_events', { n: 50 });
      if (error) {
        console.warn('認領 webhook 事件失敗', error.message);
        break;
      }
      if (!rows?.length) break;
      for (const row of rows as { id: number; channel_id: string; payload: unknown }[]) {
        try {
          const events = connector.parseEvents({ events: [row.payload] });
          for (const ev of events) await handleEvent(ev, row.channel_id);
          await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('id', row.id);
          for (const ev of events) if (ev.kind === 'message') scheduleExtract(ev.message.groupId);
          done++;
        } catch (e) {
          // 不標 processed：租約過期（10 分鐘）後會再被認領，最多 5 次
          await db.from('webhook_events').update({ error: String((e as Error)?.message ?? e).slice(0, 500) }).eq('id', row.id);
          console.error('webhook 事件處理失敗（稍後重試）', row.id, e);
        }
      }
    }
    } while (again);
  } finally {
    running = false;
  }
  return done;
}
