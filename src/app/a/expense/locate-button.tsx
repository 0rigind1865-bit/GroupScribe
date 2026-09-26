'use client';

import { useState } from 'react';

// 附上目前位置（X2-7，Snaptab lib/location.ts）：瀏覽器內建定位，只存座標。
// 不串 Google 反查地名（會花錢）——地名讓員工自己填。按了才定位，不會一打開就跳權限詢問。
export function LocateButton() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'fail'>('idle');
  const locate = () => {
    if (!navigator.geolocation) return setState('fail');
    setState('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setState('idle');
      },
      () => setState('fail'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  return (
    <span className="flex items-center gap-2 text-sm">
      <input type="hidden" name="lat" value={pos?.lat ?? ''} />
      <input type="hidden" name="lng" value={pos?.lng ?? ''} />
      <button type="button" className="btn btn-sm" onClick={locate} disabled={state === 'busy'}>
        {pos ? '已附上位置 ✓' : state === 'busy' ? '定位中…' : '附上目前位置'}
      </button>
      {state === 'fail' && <span className="text-xs text-gray-500">拿不到位置（沒開定位權限？），可以不附</span>}
    </span>
  );
}
