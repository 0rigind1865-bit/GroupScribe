import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { workDate } from '@/attend/util';
import { Flash } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { RangeMap } from '@/app/ui/range-map';
import { UseHere } from './use-here';
import { RADII, RadiusPicker } from './radius';

export const dynamic = 'force-dynamic';

// 打卡地點（2026-10 設計畫布「打卡地點」）：選一個地點（?loc=）→ 上面看地圖與範圍圈圈、範圍用 4 個選項改；
// 新增＝站在現場按一下（瀏覽器定位帶入經緯度）。不在現場的後備：貼上座標。
// ponytail: 設計稿的「在地圖上搜尋地址」沒做（要接地理編碼服務）；先用 Google 地圖長按複製座標貼上
const FLASH = {
  added: { tone: 'ok' as const, text: '地點已新增 ✓' },
  radius: { tone: 'ok' as const, text: '範圍已更新 ✓（員工下次打卡就照新的範圍）' },
  ERR_LOCATION_PARAMS: { tone: 'err' as const, text: '請填地點名稱與合法座標' },
  ERR_LOCATION_IN_USE: { tone: 'err' as const, text: '這個地點已經有人打過卡，不能刪——請改用停用' },
  ERR_WRITE: { tone: 'err' as const, text: '寫入失敗，請稍後再試' },
};

type Loc = { id: string; name: string; lat: number; lng: number; radius_m: number; enabled: boolean };

export default async function LocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string; loc?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const sp = await searchParams;
  const db = getDb();

  const [{ data }, { data: todayPunches }] = await Promise.all([
    db.from('punch_locations').select('*').eq('org_id', org.id).order('created_at'),
    db.from('punch_records').select('employee_id, location_id').eq('org_id', org.id).eq('work_date', workDate(new Date())),
  ]);
  const locs = (data ?? []) as Loc[];
  // 選中的：?loc= 優先，否則第一個啟用中的
  const cur = locs.find((l) => l.id === sp.loc) ?? locs.find((l) => l.enabled) ?? locs[0];
  const herePeople = new Set((todayPunches ?? []).filter((p) => p.location_id === cur?.id).map((p) => p.employee_id)).size;

  return (
    <main className="page">
      <h1>打卡地點</h1>
      <p className="mt-1 mb-4 text-[13px] text-gray-600">員工要在圈圈裡面才能打卡。</p>
      <Flash sp={sp} dict={FLASH} />

      {cur && (
        <section className="card mb-4 overflow-hidden p-0" aria-label={`${cur.name}的範圍`}>
          <RangeMap circles={[{ lat: cur.lat, lng: cur.lng, radius: cur.radius_m, name: cur.name }]} />
          <div className="space-y-2.5 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-bold">{cur.name}</span>
              <span className="text-xs text-gray-600">{cur.enabled ? `今天 ${herePeople} 人在這打卡` : '停用中'}</span>
            </div>
            {/* 範圍：按一下就存（每顆都是送出鈕），不用打數字 */}
            <form action="/api/attend/location" method="post" role="group" aria-label="範圍" className="segmented grid w-full grid-cols-4 [&>button]:min-h-10">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={cur.id} />
              <input type="hidden" name="action" value="radius" />
              {RADII.map((r) => (
                <button key={r} name="radius" value={r} aria-pressed={cur.radius_m === r}>
                  {r} 公尺
                </button>
              ))}
            </form>
            <form action="/api/attend/location" method="post" className="flex items-center justify-end gap-2">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={cur.id} />
              <button className="btn btn-sm" name="action" value="toggle">
                {cur.enabled ? '停用' : '啟用'}
              </button>
              <button className="btn-danger btn-sm" name="action" value="delete">
                刪除
              </button>
            </form>
          </div>
        </section>
      )}

      {locs.length > 0 ? (
        <div className="card mb-4 divide-y divide-gray-100 overflow-hidden p-0">
          {locs.map((l) => {
            const on = l.id === cur?.id;
            return (
              <a
                key={l.id}
                href={oh(slug, '/attend/locations', { loc: l.id })}
                aria-current={on ? 'true' : undefined}
                className={`flex min-h-[58px] items-center gap-3 px-3.5 ${on ? 'bg-emerald-50' : 'hover:bg-gray-50'} ${l.enabled ? '' : 'text-gray-400'}`}
              >
                <svg viewBox="0 0 24 24" className={`h-5 w-5 flex-none ${on ? 'text-emerald-700' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{l.name}</span>
                  <span className={`block text-xs ${l.enabled ? 'text-gray-600' : ''}`}>{l.enabled ? `${l.radius_m} 公尺` : '停用中'}</span>
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Empty title="還沒有打卡地點" hint="員工必須站在某個地點的範圍內才能打卡——到現場按下面的按鈕新增一個。" />
        </div>
      )}

      <UseHere slug={slug} />

      {/* 不在現場的後備：Google 地圖長按（電腦版右鍵）→ 複製座標，貼進來 */}
      <details className="mt-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-gray-600">不在現場？貼上座標新增</summary>
        <form action="/api/attend/location" method="post" className="card mt-2 space-y-3">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="action" value="add" />
          <label className="block">
            <span className="label mb-1 block">名稱</span>
            <input className="input w-full" name="name" placeholder="例：總公司" required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label mb-1 block">緯度</span>
              <input className="input w-full" name="lat" placeholder="25.0330" inputMode="decimal" required />
            </label>
            <label className="block">
              <span className="label mb-1 block">經度</span>
              <input className="input w-full" name="lng" placeholder="121.5654" inputMode="decimal" required />
            </label>
          </div>
          <div>
            <span className="label mb-1 block">範圍</span>
            <RadiusPicker />
          </div>
          <button className="btn w-full">新增</button>
        </form>
      </details>
      <p className="mt-2 text-xs leading-relaxed text-gray-600">有人打過卡的地點不能刪，只能停用。</p>
    </main>
  );
}
