'use client';

import { useEffect, useRef, useState } from 'react';

// 地圖＋範圍圈圈（2026-10 設計畫布「打卡地點」）：管理端看得到每個打卡地點的圈圈有多大。
// Leaflet 走 CDN 不進 npm，載法與三個坑照員工端 src/app/a/punch-client.tsx（那支有自己一份，這裡不動它）：
//   1. 容器一開始就有尺寸，只有確定失敗才收；2. CSS 到了才畫，不然 tile 疊在左上角；
//   3. script 已在 DOM（換頁回來）要看 window.L，不能只等 'load'。
// 失敗（CDN 掛、webview 擋）只把地圖換成一行字，頁面其他東西照常。
declare global {
  interface Window {
    L: any;
  }
}

export type MapCircle = { lat: number; lng: number; radius: number; name: string };

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function loadLeaflet(): Promise<boolean> {
  const css = new Promise<void>((resolve) => {
    const existing = document.getElementById('leaflet-css') as HTMLLinkElement | null;
    if (existing) return existing.dataset.loaded ? resolve() : existing.addEventListener('load', () => resolve());
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.onload = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  const js = new Promise<boolean>((resolve) => {
    if (window.L) return resolve(true);
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.id = 'leaflet-js';
    s.src = LEAFLET_JS;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return Promise.all([css, js]).then(([, ok]) => ok);
}

export function RangeMap({ circles, className = 'h-52' }: { circles: MapCircle[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const sig = JSON.stringify(circles); // 圈圈內容變了才重畫（父層每次渲染都給新陣列）

  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    loadLeaflet().then((ok) => {
      if (cancelled || !el.current) return;
      if (!ok) return setFailed(true);
      try {
        const L = window.L;
        map = L.map(el.current, { attributionControl: false }).setView([25.033, 121.5654], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        const group = (JSON.parse(sig) as MapCircle[]).map((c) => {
          L.circleMarker([c.lat, c.lng], { radius: 5, color: '#0f5c46', fillColor: '#0f5c46', fillOpacity: 1 }).addTo(map);
          return L.circle([c.lat, c.lng], { color: '#0f5c46', weight: 2, fillColor: '#0f5c46', fillOpacity: 0.16, radius: c.radius })
            .addTo(map)
            .bindPopup(`${c.name}（${c.radius} 公尺）`);
        });
        if (group.length) map.fitBounds(L.featureGroup(group).getBounds().pad(0.4));
        for (const d of [0, 200, 600]) setTimeout(() => !cancelled && map.invalidateSize(), d);
      } catch {
        setFailed(true);
      }
    });
    const giveUp = setTimeout(() => !map && !cancelled && setFailed(true), 5000);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      map?.remove();
    };
  }, [sig]);

  if (failed) return <p className="bg-gray-50 px-3.5 py-3 text-xs text-gray-500">地圖載不出來（網路或瀏覽器擋住了），範圍設定照常有效。</p>;
  // isolate：Leaflet 圖層 z-index 400～1000 會壓過抽屜與底部導覽，自成一層就不會（同員工端）
  return <div ref={el} role="img" aria-label={circles.map((c) => `地圖：${c.name}，範圍 ${c.radius} 公尺`).join('；')} className={`isolate w-full bg-gray-100 ${className}`} />;
}
