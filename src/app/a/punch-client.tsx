'use client';

import { useRef, useState } from 'react';

// GPS 打卡鈕（client component 的理由：navigator.geolocation 是瀏覽器 API，
// 無伺服端替代——先例：g/liff-init.tsx 的 LIFF SDK）。
// 取得座標後填進隱藏表單送出，其餘流程維持 MPA（伺服端驗半徑、redirect 回結果）。
export function PunchButtons() {
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [err, setErr] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function punch(type: 'in' | 'out') {
    if (busy) return;
    setErr('');
    if (!navigator.geolocation) {
      setErr('這個瀏覽器不支援定位，請改用手機 LINE 開啟');
      return;
    }
    setBusy(type);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const f = formRef.current!;
        (f.elements.namedItem('type') as HTMLInputElement).value = type;
        (f.elements.namedItem('lat') as HTMLInputElement).value = String(pos.coords.latitude);
        (f.elements.namedItem('lng') as HTMLInputElement).value = String(pos.coords.longitude);
        f.submit();
      },
      (e) => {
        setBusy(null);
        setErr(e.code === e.PERMISSION_DENIED ? '請允許定位權限後再試一次' : `定位失敗：${e.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div>
      <form ref={formRef} action="/api/attend/punch" method="post" className="hidden">
        <input type="hidden" name="type" />
        <input type="hidden" name="lat" />
        <input type="hidden" name="lng" />
      </form>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => punch('in')} disabled={!!busy} className="btn-primary py-4 text-lg font-bold">
          {busy === 'in' ? '定位中…' : '上班打卡'}
        </button>
        <button type="button" onClick={() => punch('out')} disabled={!!busy} className="btn py-4 text-lg font-bold">
          {busy === 'out' ? '定位中…' : '下班打卡'}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
