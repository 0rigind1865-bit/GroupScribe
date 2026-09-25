import { dbConfigured } from '@/db';
import { liffId, liffUser, myGroups } from '@/core/liff';
import { SurfaceSwitcher } from '@/app/ui/surface-switcher';
import { LiffInit } from './liff-init';

export const dynamic = 'force-dynamic';

// LIFF 成員版首頁：列出「你是成員」的群組（成員資格由 LINE 群成員 API 判定，見 core/liff.ts）。
//
// 其他面向（打卡、管理後台）的入口統一由 SurfaceSwitcher 提供，本頁不再手刻導覽卡。
// ⚠ 可見性是權限邊界：LINE 群組裡可能有別家公司的人（協力廠商、客戶），他們該看得到
// 本群的整理，但完全不該知道考勤系統存在——判定在 src/org/surfaces.ts。
export default async function LiffHome() {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const adminUnset = !process.env.ADMIN_LINE_USER_ID?.trim();
  const mine = await myGroups(uid); // 排除未認領與群記已離開的群（core/liff.ts）

  return (
    <main className="mx-auto max-w-md p-5">
      {/* 面向切換器：取代原本手刻的「打卡系統」與「管理後台」兩張卡片。
          可見性規則不變（沒權限的面向不出現），但改由 src/org/surfaces.ts 單一判定。 */}
      <div className="mb-3">
        <SurfaceSwitcher current="groups" />
      </div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">你的群組</h1>
      <p className="mb-4 text-sm text-gray-500">
        {mine.length
          ? '選一個群組看整理好的行程、待辦與公告。'
          : '你是 GroupScribe 所在群組的成員，這裡就會出現該群的整理。看不到群組？bot 可能還沒被加進群，或你已退出該群。'}
      </p>

      <div className="space-y-2">
        {mine.map((g) => (
          <a key={g.group_id} href={`/g/${encodeURIComponent(g.group_id)}`} className="card flex items-center gap-3 hover:bg-gray-50">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-600 font-bold text-white">
              {(g.name ?? g.group_id).slice(0, 1)}
            </span>
            <span className="font-bold">{g.name ?? g.group_id}</span>
            <span className="ml-auto text-gray-300">›</span>
          </a>
        ))}
      </div>

      {adminUnset && (
        <details className="mt-6 text-xs text-gray-400">
          <summary className="cursor-pointer">我是管理者，要開啟免密碼進後台</summary>
          <p className="mt-2">
            把下面這行加進伺服器的 <code>.env.local</code> 後重啟，用這個 LINE 帳號開啟時就會出現「管理後台」入口：
          </p>
          <p className="mt-1 rounded bg-gray-100 px-2 py-1 font-mono break-all text-gray-600">ADMIN_LINE_USER_ID={uid}</p>
        </details>
      )}
    </main>
  );
}
