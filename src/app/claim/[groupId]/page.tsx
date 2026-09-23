import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db';
import { liffUser, verifyClaimToken } from '@/core/liff';
import { isPlatformOwner } from '@/org/orgs';

export const dynamic = 'force-dynamic';

// 認領頁（商業計劃 A5）：bot 進群後貼的連結會到這裡。
// 誰能認領：拿得到連結（＝看得到群內訊息）且是某個 org 管理員的人；平台擁有者可認領到任何 org。
// 先認領者得；已認領的群顯示由誰管理，不提供搶奪（轉移由平台擁有者在群組頁做）。
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
  if (!uid && !owner) redirect(`/api/auth/line?next=${encodeURIComponent(`/claim/${encodeURIComponent(groupId)}?t=${t}`)}`);

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
        db.from('groups').select('group_id', { count: 'exact', head: true }).eq('org_id', o.id).is('left_at', null),
      ]);
      quota = { used: count ?? 0, max: st?.max_groups ?? 1 };
    }
  }
  const full = !!quota && quota.used >= quota.max;

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="card space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-500">GroupScribe · 認領群組</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{groupName}</h1>
        </div>

        {claimedBy ? (
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
            <a className="btn-primary w-full" href={`/start?next=${encodeURIComponent(`/claim/${encodeURIComponent(groupId)}?t=${t}`)}`}>
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
            <p className="text-xs text-gray-500">認領前 bot 不會記錄任何訊息；認領後群裡的人可以在 LINE 裡看到整理結果。</p>
          </form>
        )}
      </div>
    </main>
  );
}
