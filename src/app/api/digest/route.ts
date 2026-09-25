import { NextRequest, NextResponse } from 'next/server';
import { runDailyDigest } from '@/core/digest';
import { leaveStaleUnclaimed } from '@/core/ingest';
import { verifyAdminSession } from '@/core/auth';

export const maxDuration = 300;

// 每日摘要觸發（NAS cron 每天早上打一次）。
// 認證：有效的 admin cookie，或帶 ?key=<CRON_SECRET>（cron 用；middleware 已放行 /api/digest 需自行把關）。
// CRON_SECRET 與管理密碼分開（商業計劃 G2）：cron 網址會出現在 crontab 與日誌裡，不該是後台鑰匙。
// ponytail: 未設 CRON_SECRET 時退回 ADMIN_PASSWORD，NAS crontab 換好新 key 後可拿掉這個退路
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const cronKey = process.env.CRON_SECRET ?? process.env.ADMIN_PASSWORD;
  // 以前只檢查 cookie 裡「有 gs_auth= 這幾個字」，任何人塞假 cookie 就能觸發全站推播——必須驗簽
  const viaCookie = verifyAdminSession(req.cookies.get('gs_auth')?.value);
  if (!viaCookie && (!cronKey || key !== cronKey)) {
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
