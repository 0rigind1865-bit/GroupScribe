import { NextRequest } from 'next/server';
import { redirectTo } from '@/http';
import { liffUser } from '@/core/liff';
import { logFunnel } from '@/core/funnel';
import { normalizeRefCode, REFERRAL, referrerByCode } from '@/org/referral';

// 推薦連結 /r/<推薦碼>：記 cookie（對方先去逛別頁、30 天內回來建立組織也算）→ 導到 /start 並帶著推薦碼。
// 推薦碼無效（打錯、組織已刪）照樣導到 /start，只是沒有推薦——連結壞掉也不能把人擋在門外。
// 公開路徑：middleware 的 matcher 排除了 r/（對方還沒登入）。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRefCode((await params).code);
  const ref = code ? await referrerByCode(code).catch(() => null) : null;
  if (!ref) return redirectTo('/start', 307);

  await logFunnel({ org_id: ref.id, line_user_id: await liffUser(), step: 'ref_open', source: null });
  const res = redirectTo(`/start?ref=${code}`, 307);
  res.cookies.set(REFERRAL.cookie, code, {
    path: '/',
    maxAge: REFERRAL.cookieDays * 86_400,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  });
  return res;
}
