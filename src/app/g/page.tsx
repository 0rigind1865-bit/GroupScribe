import { dbConfigured } from '@/db';
import { redirect } from 'next/navigation';
import { isGroupMember, liffId, liffUser, myGroups } from '@/core/liff';
import { liffStatePath, logFunnel, parseLiffEntry } from '@/core/funnel';
import { IdentityBar, identityBarShown } from '@/app/ui/identity-bar';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { hasAdminPending } from '@/org/pending';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { LiffInit } from './liff-init';

export const dynamic = 'force-dynamic';

// LIFF 成員版首頁：列出「你是成員」的群組（成員資格由 LINE 群成員 API 判定，見 core/liff.ts）。
//
// 其他身分（打卡、公司管理）的入口統一由身分列提供（src/app/ui/identity-bar.tsx），本頁不再手刻導覽卡。
// ⚠ 可見性是權限邊界：LINE 群組裡可能有別家公司的人（協力廠商、客戶），他們該看得到
// 本群的整理，但完全不該知道考勤系統存在——判定在 src/org/surfaces.ts。
export default async function LiffHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  // 單群深連結（L1）：?g=<groupId> 且本人是成員 → 直接進該群（由群組頁記漏斗）；不是成員就忽略 g
  const sp = await searchParams;
  const entry = parseLiffEntry(sp);
  if (entry.g && (await isGroupMember(entry.g, uid)))
    redirect(`/g/${encodeURIComponent(entry.g)}${entry.src ? `?src=${entry.src}` : ''}`);
  await logFunnel({ line_user_id: uid, step: 'liff_open', source: entry.src });
  // LIFF endpoint 設在 /g 時，深連結的路徑包在 liff.state（同 src/app/page.tsx）
  // 目的地就是 /g 本身時不轉（已經在這了，轉了會重記一次漏斗）
  const dest = liffStatePath(sp);
  if (dest && !/^\/g(\?|$)/.test(dest)) redirect(dest);

  const mine = await myGroups(uid); // 排除未認領與群記已離開的群（core/liff.ts）
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const groups = groupSurfaces((await surfaces()).list);
  const barShown = identityBarShown(groups, 'me');
  const dot = barShown && (await hasAdminPending(groups, uid));

  return (
    <main className="mx-auto max-w-md p-5">
      {/* 身分列（個人・淺色，畫布 IdMeGroups）：只有群組身分的人整列不渲染，只留「群記」小字。
          可見性由 src/org/surfaces.ts 單一判定，沒權限的東西 DOM 裡也不存在。 */}
      {barShown ? (
        <div className="-mx-5 -mt-5 mb-2">
          <IdentityBar groups={groups} currentKey="groups" side="me" tt={tt} dot={dot} />
        </div>
      ) : (
        <p className="mb-2 text-base font-black" style={{ fontFamily: 'var(--font-title)' }}>
          群記
        </p>
      )}
      <h1 className="mb-1 text-[30px] leading-tight font-black tracking-[1px]" style={{ fontFamily: 'var(--font-title)' }}>
        你的群組
      </h1>
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

    </main>
  );
}
