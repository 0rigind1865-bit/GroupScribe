import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { dbConfigured } from '@/db';
import { isGroupMember, liffId, liffUser } from '@/core/liff';
import { liffStatePath, parseLiffEntry } from '@/core/funnel';
import { surfaces } from '@/org/surfaces';
import { BrandBar } from '@/app/ui/intro';
import { LiffInit } from './g/liff-init';

export const dynamic = 'force-dynamic';

// 全站唯一入口：所有人都從同一個 LINE 連結進來，這裡依身分決定去哪。
//
//   只有一種身分 → 直接進去
//   兩種以上     → 記得上次選的就直接進去；第一次（或 ?menu=1）顯示選單讓他自己選
//   沒有身分     → 還沒用 LINE 登入就先跑 LIFF 開機；登入了還是沒有，就說明並給建立組織的入口
//
// 原本是系統「猜」：有員工身分就一律先進打卡。老闆同時是員工的話，每次點開都先跑到打卡頁，
// 而頁首那排切換膠囊不顯眼，很多人不知道還有別的頁面（principles.md：別讓我想）。
export default async function Root({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!dbConfigured()) redirect('/login');

  const uid = await liffUser();
  const sp = await searchParams;
  // LIFF endpoint 設在 / 時，觸點連結的 ?g=／?src=（或包在 liff.state 裡）會先到這裡；
  // 下面的 redirect 會丟掉 query，所以單群深連結要先處理（L1）
  // LIFF 深連結（/o/acme/inbox 這種）：已登入的人不跑 liff.init，路徑要自己從 liff.state 拆出來，
  // 不然會被下面的「上次用的身分」帶走。沒登入的人交給 LiffInit，liff.init 會自己轉過去。
  const dest = uid ? liffStatePath(sp) : null;
  if (dest) redirect(dest);
  const entry = parseLiffEntry(sp);
  if (uid && entry.g && (await isGroupMember(entry.g, uid)))
    redirect(`/g/${encodeURIComponent(entry.g)}${entry.src ? `?src=${entry.src}` : ''}`);
  const { list } = await surfaces();
  const menu = typeof sp.menu === 'string' ? sp.menu : undefined;

  if (list.length === 1 && !menu) redirect(list[0].href);
  if (list.length > 1) {
    const last = (await cookies()).get('gs_surface')?.value;
    const hit = list.find((s) => s.key === last);
    if (hit && !menu) redirect(hit.href);
    return (
      <div className="mx-auto max-w-md pb-8">
        <BrandBar />
        <main className="px-4">
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">你想做什麼？</h1>
          <p className="mt-1 mb-5 text-sm text-gray-600">
            這個 LINE 帳號有 {list.length} 種身分。選一個，下次打開會直接帶你去。想換身分，用頁面上方的切換膠囊（管理後台在「更多」頁最下面）。
          </p>
          <div className="space-y-3">
            {list.map((s) => (
              <a key={s.key} href={`/go/${encodeURIComponent(s.key)}`} className="card flex items-center gap-3 rounded-2xl hover:bg-gray-50">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-base font-semibold">{s.label}</span>
                    {s.key === last && (
                      <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] font-medium text-emerald-900">上次使用</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-600">{s.desc}</span>
                </span>
                <span className="text-xl text-gray-300">›</span>
              </a>
            ))}
          </div>
        </main>
      </div>
    );
  }
  if (!uid) return <LiffInit liffId={liffId()} />;

  // 有身分但沒有任何面向：不是員工、不在任何已認領的群、也不是管理員
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="mb-2 text-lg font-bold">GroupScribe</p>
      <p className="text-sm text-gray-500">
        這個 LINE 帳號還沒有可用的功能。
        <br />
        要打卡請向管理員索取加入連結；要看群組整理，請先加入有群記的群組（群組要先被管理員認領）。
      </p>
      <a className="btn-primary mt-4" href="/start">
        我是管理者，免費建立組織
      </a>
    </main>
  );
}
