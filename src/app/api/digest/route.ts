import { NextRequest, NextResponse } from 'next/server';
import { runDailyDigest } from '@/core/digest';
import { leaveStaleUnclaimed } from '@/core/ingest';

export const maxDuration = 300;

// 每日摘要觸發（NAS cron 每天早上打一次）。
// 認證：中介層的 admin cookie，或帶 ?key=<ADMIN_PASSWORD>（cron 用；middleware 已放行 /api/digest 需自行把關）。
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const pw = process.env.ADMIN_PASSWORD;
  const viaCookie = req.headers.get('cookie')?.includes('gs_auth=');
  if (!viaCookie && (!pw || key !== pw)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }
  try {
    const digest = await runDailyDigest();
    // 未認領 7 天的群自動退出（A5）；同一支 cron 順手做，不另開排程
    const left_unclaimed = await leaveStaleUnclaimed().catch((e) => (console.error('退出未認領群失敗', e), 0));
    return NextResponse.json({ ...digest, left_unclaimed });
  } catch (e) {
    console.error('每日摘要失敗', e);
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
