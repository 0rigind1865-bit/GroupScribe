'use client';

import { useEffect, useRef, useState } from 'react';

// 官網開場動畫（public/brand/intro.mp4，由 scripts/intro-video.mjs 產生，含配樂）。
// 瀏覽器只准「靜音」自動播放：先靜音播一次；配樂要使用者按一下才放得出來。
// 偏好減少動態的人不自動播，停在封面（最後一格：貓頭鷹＋群記），要看自己按。
export function IntroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'muted' | 'sound' | 'ended'>('muted');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.pause();
  }, []);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {});
    setState('sound');
  };

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-sm">
      <video
        ref={ref}
        src="/brand/intro.mp4"
        poster="/brand/intro-poster.jpg"
        autoPlay
        muted
        playsInline
        onEnded={() => setState((s) => (s === 'sound' ? 'ended' : s))}
        aria-label="群記開場動畫：貓頭鷹從群組的雜訊裡抓出一則訊息，變成「群記」"
        className="block aspect-video w-full"
      />
      {state !== 'sound' && (
        <button
          type="button"
          onClick={play}
          className="absolute right-2 bottom-2 min-h-9 rounded-full bg-black/55 px-3 text-xs font-medium text-white backdrop-blur-sm"
        >
          {state === 'muted' ? '開聲音重看' : '再看一次'}
        </button>
      )}
    </div>
  );
}
