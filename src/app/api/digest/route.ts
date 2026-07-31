import { NextRequest, NextResponse } from 'next/server';
import { runDailyDigest } from '@/core/digest';

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
    return NextResponse.json(await runDailyDigest());
  } catch (e) {
    console.error('每日摘要失敗', e);
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
