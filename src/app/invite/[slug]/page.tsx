import type { Metadata } from 'next';
import { liffUser, verifyInviteToken } from '@/core/liff';
import { moduleAccess, orgBySlug } from '@/org/orgs';
import { BrandBar } from '@/app/ui/intro';

export const dynamic = 'force-dynamic';

// 用 LINE 傳連結時畫的預覽卡；不放公司名（連結外流時不多洩漏一個字）
export const metadata: Metadata = {
  title: '管理員邀請',
  description: '群記：群裡講過的，都記得。點開用 LINE 登入，一鍵加入成為管理員。',
  openGraph: { title: '管理員邀請 · 群記', images: ['/brand/og.png'] },
};

// 管理員邀請頁：擁有者在「設定」產生連結、用 LINE 傳給同事；同事登入後按一下就成為群組助理管理員。
// 放在 /o 外面（同 /claim）：被邀的人還不是成員，/o/[org] 會 404。
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { slug } = await params;
  const { e, t } = await searchParams;
  const org = await orgBySlug(slug);
  const ok = !!org && verifyInviteToken(org.id, e, t);
  const uid = ok ? await liffUser() : null;
  const already = uid ? !!(await moduleAccess(slug, 'gs')) : false;
  const here = `/invite/${encodeURIComponent(slug)}?e=${e}&t=${t}`;

  return (
    <div className="mx-auto max-w-md pb-8">
      <BrandBar />
      <main className="px-4">
        <div className="card space-y-4 rounded-2xl">
          {!ok ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">這個邀請連結已經失效</h1>
              <p className="text-sm text-gray-700">連結超過 3 天就會失效。請邀請你的人到「設定 → 管理員」再傳一次。</p>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium text-gray-500">管理員邀請</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight">{org!.name}</h1>
              </div>
              {already ? (
                <>
                  <p className="text-sm text-gray-700">你已經是這家公司的管理員了。</p>
                  <a className="btn-primary w-full" href={`/o/${encodeURIComponent(slug)}`}>
                    前往後台
                  </a>
                </>
              ) : !uid ? (
                <>
                  <p className="text-sm text-gray-700">有人邀請你一起管理這家公司的群記。用 LINE 登入就能加入。</p>
                  <a className="btn-primary h-11 w-full text-base" href={`/api/auth/line?next=${encodeURIComponent(here)}`}>
                    用 LINE 登入
                  </a>
                </>
              ) : (
                <form action="/api/org/invite" method="post" className="space-y-3">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="e" value={e} />
                  <input type="hidden" name="t" value={t} />
                  <p className="text-sm text-gray-700">
                    加入後，你可以查看和管理這家公司<strong>所有群組</strong>的整理結果：行程、待辦、公告和檔案。
                  </p>
                  <label className="label block">
                    你的名字（讓其他管理員認得你）
                    <input className="input mt-1 block w-full" name="name" required maxLength={20} placeholder="例如：王小明" />
                  </label>
                  <button className="btn-primary w-full">加入成為管理員</button>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
