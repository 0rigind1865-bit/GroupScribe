'use client';

import { useState } from 'react';
import { RadiusPicker } from './radius';

// 「站在現場，用我現在的位置新增」（2026-10 設計畫布「打卡地點」）：按一下由瀏覽器定位帶入經緯度，
// 再填個名字、選範圍就好，不用查經緯度。定位失敗時頁面下方還有「貼上座標」可以用。
// client 的理由：navigator.geolocation 只有瀏覽器有（原本頁內 <script> 在站內換頁時不會執行，2026-09-27 審查）
export function UseHere({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);

  function locate() {
    setMsg('');
    if (!navigator.geolocation) return setMsg('這個瀏覽器不能定位，請用下面的「貼上座標」。');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      (e) => {
        setBusy(false);
        setMsg(e.code === e.PERMISSION_DENIED ? '沒有定位權限：請在瀏覽器設定允許定位，或用下面的「貼上座標」。' : `定位失敗（${e.message}），可以再按一次，或用下面的「貼上座標」。`);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  if (pos)
    return (
      <form action="/api/attend/location" method="post" className="card space-y-3">
        <input type="hidden" name="org" value={slug} />
        <input type="hidden" name="action" value="add" />
        <input type="hidden" name="lat" value={pos.lat.toFixed(6)} />
        <input type="hidden" name="lng" value={pos.lng.toFixed(6)} />
        <p className="text-sm text-gray-600">
          抓到你現在的位置了（誤差約 {Math.round(pos.acc)} 公尺{pos.acc > 100 ? '，有點大，範圍建議選大一點' : ''}）。
        </p>
        <label className="block">
          <span className="label mb-1 block">這裡叫什麼</span>
          <input className="input w-full" name="name" placeholder="例：中山北路工地" required autoFocus />
        </label>
        <div>
          <span className="label mb-1 block">範圍</span>
          <RadiusPicker />
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" className="btn" onClick={() => setPos(null)}>
            取消
          </button>
          <button className="btn-primary">新增這個地點</button>
        </div>
      </form>
    );

  return (
    <>
      <button type="button" className="btn-primary min-h-[52px] w-full text-[15px]" disabled={busy} onClick={locate}>
        {busy ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        )}
        {busy ? '定位中…' : '站在現場，用我現在的位置新增'}
      </button>
      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </>
  );
}
