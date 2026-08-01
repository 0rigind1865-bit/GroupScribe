'use client';

import { useEffect, useRef, useState } from 'react';

// 打卡專區：地圖 + 定位狀態 + 兩顆大按鈕（版面對齊文輝考勤系統的儀表板）。
//
// client component 的理由：navigator.geolocation 與 Leaflet 都是瀏覽器 API，無伺服端替代。
// Leaflet 走 CDN 不進 npm——比照 g/liff-init.tsx 載 LINE SDK 的慣例（極簡依賴原則）。
//
// ⚠ 硬需求：地圖失敗不能擋住打卡。CDN 掛掉、LINE webview 擋外部 script、使用者拒絕定位，
// 三種情況都只降級掉地圖區塊，狀態列與按鈕照常運作，退回「按鈕按下才定位」的行為。
// 員工打不了卡是生產事故，地圖只是輔助。
declare global {
  interface Window {
    L: any;
  }
}

export type PunchLocation = { name: string; lat: number; lng: number; radius: number };

export type PunchLabels = {
  punchIn: string;
  punchOut: string;
  locating: string;
  geoUnsupported: string;
  geoDenied: string;
  geoFailed: string; // 含 {msg}
  inRange: string; // 含 {name}
  outOfRange: string;
  locatingStatus: string;
};

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// 與伺服端 src/attend/util.ts 的 distanceMeters 同一條公式（權威判定仍在伺服端，
// 這裡只為了在按下按鈕前就告訴使用者「你不在範圍內」，省一次來回）
function distance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function PunchPanel({ locations, labels }: { locations: PunchLocation[]; labels: PunchLabels }) {
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [err, setErr] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapOk, setMapOk] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // 定位：一次取得供地圖與打卡共用（原本地圖與按鈕各要一次權限提示）
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        /* 拒絕或失敗：靜默——按鈕按下時會再要一次並顯示原因 */
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Leaflet：CDN 載入，任何一步失敗就整塊不顯示（mapOk 保持 false）
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const boot = () => {
      try {
        const L = window.L;
        if (!L || !mapEl.current) return;
        const map = L.map(mapEl.current, { attributionControl: false }).setView([25.033, 121.5654], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        for (const loc of locations) {
          L.circle([loc.lat, loc.lng], { color: 'red', fillColor: '#f03', fillOpacity: 0.2, radius: loc.radius })
            .addTo(map)
            .bindPopup(`${loc.name}（${loc.radius}m）`);
        }
        mapRef.current = map;
        setMapOk(true);
        // 容器剛掛上時尺寸可能還是 0，Leaflet 會畫錯——文輝考勤踩過同一個坑
        setTimeout(() => map.invalidateSize(), 100);
      } catch {
        setMapOk(false);
      }
    };
    if (window.L) return boot();
    const existing = document.getElementById('leaflet-js');
    if (existing) return existing.addEventListener('load', boot);
    const s = document.createElement('script');
    s.id = 'leaflet-js';
    s.src = LEAFLET_JS;
    s.onload = boot;
    s.onerror = () => setMapOk(false); // CDN 掛掉：地圖沒了，打卡照常
    document.head.appendChild(s);
  }, [locations]);

  // 位置變動 → 移動 marker 與視野
  useEffect(() => {
    if (!mapOk || !coords || !mapRef.current) return;
    const L = window.L;
    if (!markerRef.current) {
      markerRef.current = L.marker([coords.lat, coords.lng]).addTo(mapRef.current);
      mapRef.current.setView([coords.lat, coords.lng], 17);
    } else {
      markerRef.current.setLatLng([coords.lat, coords.lng]);
    }
  }, [coords, mapOk]);

  const hit = coords ? locations.find((l) => distance(coords.lat, coords.lng, l.lat, l.lng) <= l.radius) : null;
  // 只有「已定位且確定不在任何範圍內」才擋；還沒定位到不擋（讓伺服端判定）
  const blocked = !!coords && locations.length > 0 && !hit;

  function submit(type: 'in' | 'out', lat: number, lng: number) {
    const f = formRef.current!;
    (f.elements.namedItem('type') as HTMLInputElement).value = type;
    (f.elements.namedItem('lat') as HTMLInputElement).value = String(lat);
    (f.elements.namedItem('lng') as HTMLInputElement).value = String(lng);
    f.submit();
  }

  function punch(type: 'in' | 'out') {
    if (busy) return;
    setErr('');
    if (coords) {
      setBusy(type);
      submit(type, coords.lat, coords.lng);
      return;
    }
    // 還沒定位到（watchPosition 尚未回應或被拒）：按下才要一次，並顯示原因
    if (!navigator.geolocation) {
      setErr(labels.geoUnsupported);
      return;
    }
    setBusy(type);
    navigator.geolocation.getCurrentPosition(
      (p) => submit(type, p.coords.latitude, p.coords.longitude),
      (e) => {
        setBusy(null);
        setErr(e.code === e.PERMISSION_DENIED ? labels.geoDenied : labels.geoFailed.replace('{msg}', e.message));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <section className="card">
      <form ref={formRef} action="/api/attend/punch" method="post" className="hidden">
        <input type="hidden" name="type" />
        <input type="hidden" name="lat" />
        <input type="hidden" name="lng" />
      </form>

      {/* 地圖：載不起來就整塊不佔位（h-0 overflow-hidden 會留下奇怪的白，直接不渲染） */}
      <div ref={mapEl} className={mapOk ? 'mb-3 h-56 w-full rounded-lg' : 'hidden'} />

      <div className="mb-3 rounded-lg bg-gray-50 p-2 text-xs">
        {coords ? (
          <>
            <span className={hit ? 'font-bold text-emerald-700' : 'font-bold text-red-600'}>
              {hit ? labels.inRange.replace('{name}', hit.name) : labels.outOfRange}
            </span>
            <span className="ml-2 text-gray-500">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          </>
        ) : (
          <span className="text-gray-500">{labels.locatingStatus}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => punch('in')}
          disabled={!!busy || blocked}
          className="btn-primary py-4 text-lg font-bold disabled:opacity-50"
        >
          {busy === 'in' ? labels.locating : labels.punchIn}
        </button>
        <button
          type="button"
          onClick={() => punch('out')}
          disabled={!!busy || blocked}
          className="btn py-4 text-lg font-bold disabled:opacity-50"
        >
          {busy === 'out' ? labels.locating : labels.punchOut}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
