import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';

export const dynamic = 'force-dynamic';

// 打卡地點管理（對等舊 addLocation/getLocations 頁）。
// 座標取得：手機上點「用目前位置」由瀏覽器帶入（唯一一段 inline client 邏輯，
// 用原生 form + geolocation 填值，不引入地圖庫——舊系統的 Leaflet 地圖選點是 nice-to-have，
// 這裡以「貼座標或用目前位置」覆蓋同一需求；要地圖再加）。
const ERR: Record<string, string> = {
  ERR_LOCATION_PARAMS: '請填地點名稱與合法座標',
  ERR_LOCATION_IN_USE: '此地點已有打卡紀錄，不能刪除——請改用停用',
  ERR_WRITE: '寫入失敗，請稍後再試',
};

export default async function LocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { ok, err } = await searchParams;

  const { data: locs } = await getDb()
    .from('punch_locations')
    .select('*')
    .eq('org_id', org.id)
    .order('created_at');

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-5 text-3xl md:text-4xl">打卡地點</h1>
      {ok && <Banner>地點已新增 ✓</Banner>}
      {err && <Banner tone="err">{ERR[err] ?? err}</Banner>}

      <section className="card mb-5">
        <h2 className="mb-3 text-base font-bold">新增地點</h2>
        <form action="/api/attend/location" method="post" className="flex flex-wrap items-end gap-2 text-sm" id="add-loc">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="action" value="add" />
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">名稱</span>
            <input className="input w-36" name="name" placeholder="例：總公司" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">緯度</span>
            <input className="input w-32" name="lat" id="loc-lat" placeholder="25.0330" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">經度</span>
            <input className="input w-32" name="lng" id="loc-lng" placeholder="121.5654" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">半徑（公尺）</span>
            <input className="input w-24" type="number" name="radius" defaultValue={100} min={10} max={5000} />
          </label>
          <button className="btn-primary px-3 py-1.5">新增</button>
          <button className="btn px-3 py-1.5" type="button" id="use-here">用目前位置</button>
        </form>
        {/* 一小段 inline script 填座標：不值得為此開一個 client component（先例：theme toggle 類微互動） */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('use-here').addEventListener('click',function(){var b=this;b.textContent='定位中…';navigator.geolocation.getCurrentPosition(function(p){document.getElementById('loc-lat').value=p.coords.latitude.toFixed(6);document.getElementById('loc-lng').value=p.coords.longitude.toFixed(6);b.textContent='用目前位置';},function(e){b.textContent='定位失敗，手動輸入';},{enableHighAccuracy:true,timeout:15000});});`,
          }}
        />
        <p className="mt-2 text-xs text-gray-400">
          座標可從 Google Maps 長按取得（右鍵 → 複製座標），或在現場按「用目前位置」。
        </p>
      </section>

      <section className="space-y-2">
        {(locs ?? []).map((l) => (
          <div key={l.id} className={`card flex flex-wrap items-center gap-2 text-sm ${l.enabled ? '' : 'opacity-50'}`}>
            <span className="font-bold">{l.name}</span>
            <span className="text-xs text-gray-500">
              ({l.lat.toFixed(5)}, {l.lng.toFixed(5)})｜{l.radius_m}m
            </span>
            {!l.enabled && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium">停用中</span>}
            <form action="/api/attend/location" method="post" className="ml-auto flex gap-2">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={l.id} />
              <button className="btn btn-sm" name="action" value="toggle">
                {l.enabled ? '停用' : '啟用'}
              </button>
              <button className="btn-danger btn-sm" name="action" value="delete">刪除</button>
            </form>
          </div>
        ))}
        {!(locs ?? []).length && (
          <Empty title="還沒有打卡地點" hint="員工必須站在某個地點的半徑內才能打卡——先用上面的表單新增一個。" />
        )}
      </section>
    </main>
  );
}
