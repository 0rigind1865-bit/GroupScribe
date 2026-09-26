'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { isLeftCode, isRightCode, parseInvoiceCodes, type InvoiceData, type RawCode } from '@/expense/invoice';

type Phase = 'left' | 'ready' | 'right';

// 全螢幕相機掃台灣電子發票「左右兩個 QR」（從 Snaptab QRScanner 搬來）。
// 讀到左碼先停下讓人決定：掃右碼拿完整明細，或直接完成（短發票一掃就結束會漏品項）。
export function QRScanner({ onResult, onClose }: { onResult: (d: InvoiceData) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  onResultRef.current = onResult;
  onCloseRef.current = onClose;
  const leftRef = useRef<RawCode | null>(null);
  const rightRef = useRef<RawCode | null>(null);
  const phaseRef = useRef<Phase>('left');
  const finishRef = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>('left');
  const [leftItems, setLeftItems] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const stop = () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    const setBoth = (p: Phase) => {
      phaseRef.current = p;
      setPhase(p);
    };
    const finish = () => {
      if (!leftRef.current) return;
      stop();
      const parsed = parseInvoiceCodes(leftRef.current, rightRef.current);
      if (parsed) onResultRef.current(parsed);
      else onCloseRef.current();
    };
    finishRef.current = finish;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState >= video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code) {
          const binary = code.binaryData ? Uint8Array.from(code.binaryData) : undefined;
          // Big5 等非 UTF-8 位元組 jsQR 會回空 data：用位元組重建，主資訊欄位才讀得到
          const data = binary && binary.length ? String.fromCharCode(...binary) : code.data;
          const ph = phaseRef.current;
          if (ph === 'left' && !leftRef.current && isLeftCode(data)) {
            leftRef.current = { data, binary };
            navigator.vibrate?.(30);
            setLeftItems(parseInvoiceCodes(leftRef.current, null)?.itemCount ?? 0);
            setBoth('ready');
          } else if (ph === 'right' && leftRef.current && !rightRef.current && isRightCode(data) && data !== leftRef.current.data) {
            rightRef.current = { data, binary };
            navigator.vibrate?.(30);
            finish();
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        raf = requestAnimationFrame(tick);
      } catch {
        onCloseRef.current(); // 沒相機權限
      }
    })();
    return stop;
  }, []);

  const hint =
    phase === 'left'
      ? '對準發票左邊的 QR'
      : phase === 'ready'
        ? `✓ 左碼讀到了，有 ${leftItems} 項。要完整明細請「掃右碼」，或直接「完成」`
        : '對準發票右邊的 QR（以 ** 開頭的那個）';
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-emerald-600 text-white' : 'bg-black/60 text-white'}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-white/80" />
      <div className="absolute top-6 inset-x-0 flex justify-center gap-2">
        <span className={chip(phase !== 'left')}>左碼 {phase !== 'left' ? '✓' : '…'}</span>
        <span className={chip(false)}>右碼 …</span>
      </div>
      <p className="absolute inset-x-4 bottom-28 rounded-lg bg-black/60 p-3 text-center text-sm text-white">{hint}</p>
      <div className="absolute inset-x-0 bottom-8 flex justify-center gap-2 px-4">
        <button type="button" className="btn" onClick={onClose}>
          取消
        </button>
        {phase === 'ready' && (
          <>
            <button type="button" className="btn" onClick={() => finishRef.current()}>
              完成
            </button>
            <button type="button" className="btn-primary" onClick={() => ((phaseRef.current = 'right'), setPhase('right'))}>
              掃右碼
            </button>
          </>
        )}
        {phase === 'right' && (
          <button type="button" className="btn-primary" onClick={() => finishRef.current()}>
            完成
          </button>
        )}
      </div>
    </div>
  );
}
