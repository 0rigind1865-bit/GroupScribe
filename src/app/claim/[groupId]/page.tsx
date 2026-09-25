import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { liffUser, verifyClaimToken } from '@/core/liff';
import { isPlatformOwner } from '@/org/orgs';
import { BrandBar, DemoSection, FaqSection, FlowSection, LegalFooter, StepsSection, TrustSection } from '@/app/ui/intro';

export const dynamic = 'force-dynamic';

// LINE 在群裡貼連結時會抓這組 og 資料畫預覽卡（標題＋圖），群成員第一眼就看得到是群記
export async function generateMetadata({ params }: { params: Promise<{ groupId: string }> }): Promise<Metadata> {
  const { groupId } = await params;
  const { data } = await getDb().from('groups').select('name').eq('group_id', groupId).maybeSingle();
  const title = data?.name ? `認領「${data.name}」` : '認領這個群';
  const description = '群記：群裡講過的，都記得。點開了解，管理員一鍵認領。';
  return { title, description, openGraph: { title: `${title} · 群記`, description, images: ['/brand/og.png'] } };
}

// 認領頁（商業計劃 A5）：bot 進群後貼的連結會到這裡。
// 誰能認領：拿得到連結（＝看得到群內訊息）且是某個 org 管理員的人；平台擁有者可認領到任何 org。
// 先認領者得；已認領的群顯示由誰管理，不提供搶奪（轉移由平台擁有者在群組頁做）。
//
// 版面：上半是「這個群要做什麼」的動作卡，下半是服務介紹（與官方網站 /about 共用）。
// 沒登入時不再直接導去 LINE 登入——從群裡點進來的人多半還不知道群記是什麼，先讓他看懂再登入。
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { groupId } = await params;
  const { t } = await searchParams;
  if (!verifyClaimToken(groupId, t)) notFound();

  const owner = await isPlatformOwner();
  const uid = await liffUser();
  const here = `/claim/${encodeURIComponent(groupId)}?t=${t}`;
  const loginHref = `/api/auth/line?next=${encodeURIComponent(here)}`;

  const db = getDb();
  const [{ data: g }, { data: unc }] = await Promise.all([
    db.from('groups').select('name, org_id, orgs(slug, name)').eq('group_id', groupId).maybeSingle(),
    db.from('orgs').select('id').eq('slug', 'unclaimed').maybeSingle(),
  ]);
  const cur = (g as { name?: string | null; org_id?: string; orgs?: { slug?: string; name?: string } | null } | null) ?? null;
  const claimedBy = cur && unc && cur.org_id !== unc.id ? cur.orgs : null;

  // 可認領到哪些 org：平台擁有者＝全部（排除未認領）；其餘＝自己是 org_members 的
  let orgs: { slug: string; name: string }[] = [];
  if (owner) {
    orgs = ((await db.from('orgs').select('slug, name').neq('slug', 'unclaimed').order('name')).data ?? []) as typeof orgs;
  } else if (uid) {
    const { data } = await db.from('org_members').select('orgs(slug, name)').eq('line_user_id', uid);
    orgs = (data ?? []).map((r: any) => r.orgs).filter(Boolean);
  }
  const groupName = cur?.name ?? groupId;
  // 剩餘額度（只有單一 org 時顯示；多 org 由端點擋）
  let quota: { used: number; max: number } | null = null;
  if (!owner && orgs.length === 1) {
    const { data: o } = await db.from('orgs').select('id').eq('slug', orgs[0].slug).maybeSingle();
    if (o) {
      const [{ data: st }, { count }] = await Promise.all([
        db.from('org_settings').select('max_groups').eq('org_id', o.id).maybeSingle(),
        db.from('groups').select('group_id', { count: 'exact', head: true }).eq('org_id', o.id).is('left_at', null).not('group_id', 'like', 'dm:%'),
      ]);
      quota = { used: count ?? 0, max: st?.max_groups ?? 1 };
    }
  }
  const full = !!quota && quota.used >= quota.max;

  return (
    <div className="mx-auto max-w-md pb-8">
      <BrandBar />
      <main className="px-4">
      <div className="card space-y-4 rounded-2xl">
        <div>
          <p className="text-xs font-medium text-gray-500">認領群組</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{groupName}</h1>
          {!claimedBy && <p className="mt-1 text-sm text-gray-600">群記已經在這個群裡，但還沒有所屬的公司，所以還沒開始記錄。</p>}
        </div>

        {!uid && !owner && !claimedBy ? (
          <>
            <p className="text-sm text-gray-700">你是這個群所屬公司的管理員嗎？用 LINE 登入，一鍵認領。</p>
            <a className="btn-primary h-11 w-full text-base" href={loginHref}>
              用 LINE 登入並認領
            </a>
            <p className="text-xs text-gray-500">不是管理員？不用做任何事，管理員認領後你就能在 LINE 裡看到整理結果。</p>
          </>
        ) : claimedBy ? (
          <>
            <p className="text-sm text-gray-700">
              這個群已由 <strong>{claimedBy.name}</strong> 管理。
            </p>
            {orgs.some((o) => o.slug === claimedBy.slug) && (
              <a className="btn-primary" href={`/o/${claimedBy.slug}/?group=${encodeURIComponent(groupId)}`}>
                前往後台
              </a>
            )}
          </>
        ) : !orgs.length ? (
          <>
            <p className="text-sm text-gray-700">你的 LINE 帳號還沒有組織。免費建立一個，回來再點一次這個連結就能認領。</p>
            <a className="btn-primary w-full" href={`/start?next=${encodeURIComponent(here)}`}>
              建立我的組織（免費）
            </a>
          </>
        ) : full ? (
          <>
            <p className="text-sm text-gray-700">
              <strong>{orgs[0].name}</strong> 的方案已用滿（{quota!.used} / {quota!.max} 個群）。升級後就能認領這個群。
            </p>
            <a className="btn-primary w-full" href={`/o/${orgs[0].slug}/upgrade`}>
              看方案
            </a>
          </>
        ) : (
          <form action="/api/group/claim" method="post" className="space-y-3">
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="t" value={t} />
            {orgs.length === 1 ? (
              <>
                <input type="hidden" name="org" value={orgs[0].slug} />
                <p className="text-sm text-gray-700">
                  認領後，這個群的行程、待辦與公告會由 <strong>{orgs[0].name}</strong> 管理，從現在開始記錄。
                </p>
              </>
            ) : (
              <label className="label block">
                認領到哪個組織
                <select className="input mt-1 block w-full" name="org" defaultValue={orgs[0].slug}>
                  {orgs.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn-primary w-full">認領這個群</button>
            {quota && <p className="text-xs text-gray-500">目前方案：{quota.used} / {quota.max} 個群</p>}
            <p className="text-xs text-gray-500">認領前群記不會記錄任何訊息；認領後群裡的人可以在 LINE 裡看到整理結果。</p>
          </form>
        )}
      </div>

      <div className="mt-10 space-y-10">
        <DemoSection title="群記會幫這個群做什麼" />
        <FlowSection />
        <StepsSection />
        <TrustSection />
        <FaqSection />
        <a className="block text-center text-sm text-emerald-700 underline" href="/about">
          後台功能、打卡與薪資、方案 →
        </a>
      </div>
      </main>
      <LegalFooter />
    </div>
  );
}
