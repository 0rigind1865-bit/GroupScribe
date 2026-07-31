'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    liff: any;
  }
}

// LIFF 開機：載 SDK（CDN，不進 npm）→ init → 取 ID token → 後端驗證換 session cookie → 重載出內容
export function LiffInit({ liffId }: { liffId: string }) {
  const [msg, setMsg] = useState('連線 LINE 中…');
  useEffect(() => {
    if (!liffId) {
      setMsg('尚未設定 LIFF_ID（管理者請在 .env 加入後重啟）');
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = async () => {
      try {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login(); // 外部瀏覽器開啟時導去 LINE 登入；LINE 內開啟不會走到這
          return;
        }
        const idToken = window.liff.getIDToken();
        if (!idToken) {
          setMsg('取不到 LINE 身份，請關閉後重新開啟');
          return;
        }
        const r = await fetch('/api/liff/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!r.ok) {
          setMsg('身份驗證失敗，請關閉後重新開啟');
          return;
        }
        location.reload();
      } catch (e) {
        setMsg(`初始化失敗：${String(e)}`);
      }
    };
    s.onerror = () => setMsg('無法載入 LINE SDK，請檢查網路');
    document.head.appendChild(s);
  }, [liffId]);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="mb-2 text-lg font-bold">GroupScribe</p>
        <p className="text-sm text-gray-500">{msg}</p>
      </div>
    </main>
  );
}
