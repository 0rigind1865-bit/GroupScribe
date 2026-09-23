import { redirect } from 'next/navigation';
import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { surfaces } from '@/org/surfaces';
import { LiffInit } from './g/liff-init';

export const dynamic = 'force-dynamic';

// 全站唯一入口：依身分落地。
//
// 取代原本 middleware 把 `/` 寫死 302 到 /o/main 的做法——那對第二個租戶是壞的：
// acme 的管理員打根路徑會被送到 /o/main，再被導去 /o/main/attend，然後在 layout 拿到 404。
// 身分要查 DB，middleware 跑 edge runtime 查不了，所以改在這裡做。
//
// 落地優先序（src/org/surfaces.ts 的 rank）：打卡 → 我的群組 → 群組管理 → 考勤管理。
// 員工的日常動作排在管理動作前面：一天打兩次卡的人比一週看一次報表的人多。
// 覺得順序不對就改 surfaces.ts 的 rank——切換器一直在，落錯了也只是一次點擊。
export default async function Root() {
  if (!dbConfigured()) redirect('/login');

  const uid = await liffUser();
  // 沒有 LINE 身分：可能是平台擁有者用密碼登入（surfaces 會給管理面向），
  // 也可能是還沒授權的員工——後者要先跑一次 LIFF 開機流程拿身分。
  const { landing } = await surfaces();
  if (landing) redirect(landing);
  if (!uid) return <LiffInit liffId={liffId()} />;

  // 有身分但沒有任何面向：不是員工、沒發過言、也不是管理員
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="mb-2 text-lg font-bold">GroupScribe</p>
      <p className="text-sm text-gray-500">
        這個 LINE 帳號還沒有可用的功能。
        <br />
        要打卡請向管理員索取加入連結；要看群組整理請先加入有本服務的群組。
      </p>
      <a className="btn-primary mt-4" href="/start">
        我是管理者，免費建立組織
      </a>
    </main>
  );
}
