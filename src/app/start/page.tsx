import { getDb } from '@/db';
import { liffUser } from '@/core/liff';

export const dynamic = 'force-dynamic';

// 自助註冊（商業計劃：客戶自己來，平台擁有者不介入）：LINE 登入 → 取名 → 免費方案建好 → 去邀 bot 進群。
// 只收一個欄位。slug 由系統產生（中文名稱做不出合法 slug，而且客戶不需要知道 slug 是什麼）。
export default async function StartPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const uid = await liffUser();
  const safeNext = next && /^\/(?!\/)/.test(next) ? next : '';

  if (!uid) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="card space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500">GroupScribe</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">免費建立你的組織</h1>
          </div>
          <ol className="space-y-2 text-sm text-gray-700">
            <li>1. 用 LINE 登入（你就是這個組織的管理員）</li>
            <li>2. 把 GroupScribe 官方帳號邀進你的 LINE 工作群</li>
            <li>3. 點群裡的認領連結，從那一刻開始自動整理行程與待辦</li>
          </ol>
          <a className="btn-primary w-full" href={`/api/auth/line?next=${encodeURIComponent(`/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`)}`}>
            用 LINE 登入開始
          </a>
          <p className="text-xs text-gray-500">免費方案：1 個群、成員人數不限、不用綁卡。</p>
          <p className="text-xs text-amber-800">
            注意：LINE 規定一個群只能有一個官方帳號。群裡已經有其他機器人（打卡、客服等）的話，要先移出它，群記才進得去。
          </p>
          <p className="text-xs text-gray-500">
            登入即表示你同意 <a className="underline" href="/terms">服務條款</a> 與 <a className="underline" href="/privacy">隱私權政策</a>。
          </p>
        </div>
      </main>
    );
  }

  const { data: mine } = await getDb().from('org_members').select('orgs(slug, name)').eq('line_user_id', uid);
  const orgs = (mine ?? []).map((r: any) => r.orgs).filter(Boolean) as { slug: string; name: string }[];

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="card space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-500">GroupScribe</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">建立組織</h1>
        </div>
        {orgs.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="mb-1 font-medium text-gray-700">你已經是這些組織的管理員</p>
            {orgs.map((o) => (
              <a key={o.slug} className="block text-emerald-700 underline" href={`/o/${o.slug}`}>
                {o.name}
              </a>
            ))}
          </div>
        )}
        {error === 'name' && <p className="text-sm text-red-600">組織名稱請填 2～40 個字。</p>}
        {error === 'limit' && <p className="text-sm text-red-600">一個 LINE 帳號最多建立 3 個組織。</p>}
        <form action="/api/org/create" method="post" className="space-y-3">
          {safeNext && <input type="hidden" name="next" value={safeNext} />}
          <label className="label block">
            組織名稱（公司或團隊的名字）
            <input className="input mt-1 block w-full" name="name" required minLength={2} maxLength={40} placeholder="例如：宏達工程" autoFocus />
          </label>
          <button className="btn-primary w-full">建立（免費方案，1 個群）</button>
          <p className="text-xs text-gray-500">
            建立即表示你代表此組織同意 <a className="underline" href="/terms">服務條款</a> 與 <a className="underline" href="/privacy">隱私權政策</a>。
          </p>
        </form>
        <p className="text-xs text-gray-500">建好後，把 GroupScribe 官方帳號邀進你的 LINE 群，再點群裡的認領連結。</p>
      </div>
    </main>
  );
}
