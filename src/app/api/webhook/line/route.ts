import { NextRequest, NextResponse, after } from 'next/server';
import { getDb } from '@/db';
import { getConnector } from '@/core/config';
import { extractGroup } from '@/core/extract';
import { getChannelId, handleEvent, retryPendingMedia } from '@/core/ingest';

// LINE Webhook：驗簽 → 立刻回 200 → 回應後非同步處理（規劃書 4.1）
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const connector = getConnector();
  if (!connector.verifyWebhook(raw, req.headers.get('x-line-signature') ?? '')) {
    return new NextResponse('簽章驗證失敗', { status: 401 });
  }
  const events = connector.parseEvents(JSON.parse(raw));

  // 重送去重靠 messages 的 (channel_id, message_id) 唯一索引
  after(async () => {
    // 健康心跳：漏收的訊息不可回補，靜默流失必須看得見（E 節約束；設定頁顯示此時間）
    await getDb()
      .from('app_settings')
      .upsert({ id: 1, last_webhook_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.warn('webhook 心跳寫入失敗（migration 009 跑了嗎？）', error.message);
      });
    const channelId = await getChannelId();
    for (const ev of events) {
      try {
        await handleEvent(ev, channelId);
      } catch (e) {
        console.error('事件處理失敗', ev.kind, e);
      }
    }
    // 本批觸及的群組：先補解析積壓的媒體（解析完才進得了抽取），再跑結構化抽取
    const gids = [...new Set(events.flatMap((e) => (e.kind === 'message' ? [e.message.groupId] : [])))];
    for (const gid of gids) {
      await retryPendingMedia(gid).catch((e) => console.error('媒體重試失敗（下次再試）', gid, e));
      await extractGroup(gid).catch((e) => console.error('抽取失敗（留待下次補抽）', gid, e));
    }
  });
  return NextResponse.json({ ok: true });
}
