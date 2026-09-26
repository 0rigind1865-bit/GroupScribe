import { NextRequest, NextResponse, after } from 'next/server';
import { getDb } from '@/db';
import { getConnector } from '@/core/config';
import { getChannelId, handleEvent } from '@/core/ingest';
import { scheduleExtract } from '@/core/schedule';
import { landWebhook, processPendingWebhooks, rawEventRows } from '@/core/webhook-store';

// LINE Webhook：驗簽 → 原始事件先落地（webhook_events）→ 回 200 → 回應後處理（商業計劃 G4）。
// 落地失敗（migration 024 還沒跑）→ 走舊路徑：回 200 後直接處理（規劃書 4.1）。
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const connector = getConnector();
  if (!connector.verifyWebhook(raw, req.headers.get('x-line-signature') ?? '')) {
    return new NextResponse('簽章驗證失敗', { status: 401 });
  }
  const body = JSON.parse(raw);
  const channelId = await getChannelId();
  const landed = await landWebhook(rawEventRows(body, channelId));

  after(async () => {
    // 健康心跳：漏收的訊息不可回補，靜默流失必須看得見（E 節約束；設定頁顯示此時間）
    await getDb()
      .from('app_settings')
      .upsert({ id: 1, last_webhook_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.warn('webhook 心跳寫入失敗（migration 009 跑了嗎？）', error.message);
      });
    if (landed === 'landed') {
      await processPendingWebhooks(); // 也會順手處理先前失敗、租約過期的事件
      return;
    }
    // 舊路徑：重送去重靠 messages 的 (channel_id, message_id) 唯一索引
    const events = connector.parseEvents(body);
    for (const ev of events) {
      try {
        await handleEvent(ev, channelId);
      } catch (e) {
        console.error('事件處理失敗', ev.kind, e);
      }
    }
    // 本批觸及的群組：排進合批（B7）——安靜 45 秒後補解析媒體、再跑結構化抽取
    const gids = [...new Set(events.flatMap((e) => (e.kind === 'message' ? [e.message.groupId] : [])))];
    for (const gid of gids) scheduleExtract(gid);
  });
  return NextResponse.json({ ok: true });
}
