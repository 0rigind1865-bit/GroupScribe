'use client';

import { useState } from 'react';
import { RadiusPicker } from './radius';

type Place = { name: string; address: string; lat: number; lng: number };

// 「不在現場？搜尋地址新增」（2026-10 設計畫布「打卡地點」）：輸入地址 → 伺服器查 Google 給幾個候選 →
// 選一個帶入經緯度，再填名字、選範圍新增。頁面只在有 GOOGLE_MAPS_API_KEY 時才放這塊。
// client 的理由：候選清單與「選了哪一個」是畫面狀態，選好才送出新增（同「站在現場」）
export function AddressSearch({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [pick, setPick] = useState<Place | null>(null);

  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 也讓全站換頁元件不接手
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    if (!q) return;
    setBusy(true);
    setMsg('');
    setPick(null);
    try {
      const r = await fetch(`/api/attend/location/search?org=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`);
      const list: Place[] = r.ok ? (await r.json()).places : [];
      setPlaces(list);
      if (!list.length) setMsg('找不到，加上縣市或路名再試一次，或用下面的「貼上座標」。');
    } catch {
      setMsg('搜尋失敗，請再試一次。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-2 space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <input className="input min-w-0 flex-1" type="search" name="q" placeholder="地址或地名，例：台北市市府路 1 號" aria-label="地址或地名" required />
        <button className="btn" disabled={busy}>
          {busy ? '搜尋中…' : '搜尋'}
        </button>
      </form>

      {pick ? (
        <form action="/api/attend/location" method="post" className="space-y-3 border-t border-gray-100 pt-3">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="action" value="add" />
          <input type="hidden" name="lat" value={pick.lat.toFixed(6)} />
          <input type="hidden" name="lng" value={pick.lng.toFixed(6)} />
          <p className="text-sm text-gray-600">{pick.address}</p>
          <label className="block">
            <span className="label mb-1 block">這裡叫什麼</span>
            <input className="input w-full" name="name" defaultValue={pick.name} required autoFocus />
          </label>
          <div>
            <span className="label mb-1 block">範圍</span>
            <RadiusPicker />
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" className="btn" onClick={() => setPick(null)}>
              重選
            </button>
            <button className="btn-primary">新增這個地點</button>
          </div>
        </form>
      ) : (
        places.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100" aria-label="搜尋結果">
            {places.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button type="button" className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left" onClick={() => setPick(p)}>
                  <span className="font-bold">{p.name}</span>
                  <span className="text-xs text-gray-600">{p.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
