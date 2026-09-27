'use client';

import { useState } from 'react';

// 「用目前位置」：把現在的座標填進新增地點表單。
// 原本是頁內一段 <script>——站內換頁（不整頁重載）進來時 React 插入的 script 不會執行，按了沒反應（2026-09-27 審查）
export function UseHere() {
  const [label, setLabel] = useState('用目前位置');
  return (
    <button
      className="btn px-3 py-1.5"
      type="button"
      onClick={() => {
        setLabel('定位中…');
        navigator.geolocation.getCurrentPosition(
          (p) => {
            (document.getElementById('loc-lat') as HTMLInputElement).value = p.coords.latitude.toFixed(6);
            (document.getElementById('loc-lng') as HTMLInputElement).value = p.coords.longitude.toFixed(6);
            setLabel('用目前位置');
          },
          () => setLabel('定位失敗，手動輸入'),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      }}
    >
      {label}
    </button>
  );
}
