import { NextResponse } from 'next/server';
import { getDb } from '@/db';

// 健康檢查（商業計劃 A9）：給 Docker HEALTHCHECK 與外部監控打，不需登入。
// 只回 ok 與否，不透露任何內部資訊；DB 3 秒內沒回應就算不健康。
export const dynamic = 'force-dynamic';

export async function GET() {
  const ping = getDb()
    .from('app_settings')
    .select('id')
    .limit(1)
    .then(({ error }) => !error);
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 3000));
  const ok = await Promise.race([ping, timeout]).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
