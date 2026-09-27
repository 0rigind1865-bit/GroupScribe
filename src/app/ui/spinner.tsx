// 載入中畫面：給 Next.js 的 loading.tsx 用（殼留著、內容區換成這個）。
// 標誌的貓頭鷹左右轉頭：臉（眼、喙、眉、臉盤）是一片會滑動的「面具」，
// 滑到頭的邊緣就壓扁消失，露出實心的後腦勺——像真的把頭轉 180° 往後看。
// 形狀照 public/brand/mark-512.png 描的，座標以頭的中線為 x=0；動畫在 globals.css 的 .owl-face。
const HEAD = 'M-103 98L0 134L103 98L89 134L95 194L70 231L0 240L-70 231L-95 194L-89 134Z';

export function Loading({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-gray-500" role="status" aria-live="polite">
      <svg viewBox="-112 96 224 313" className="owl-loader h-14 w-auto" aria-hidden="true">
        <defs>
          {/* 遮罩：面具外＝後腦勺（全顯示）；面具內只顯示五官那幾塊 */}
          <mask id="owl-face">
            <rect x="-120" y="90" width="240" height="160" fill="#fff" />
            <g className="owl-face">
              {/* 面具和五官描一樣粗的邊，邊緣才對得齊，滑動時不會露出細白線 */}
              <path d={HEAD} fill="#000" stroke="#000" strokeWidth="1.5" />
              <g fill="#fff" stroke="#fff" strokeWidth="1.5">
                <path d="M-103 98L0 134L103 98L71 140L24 162L0 191L-24 162L-71 140Z" />
                <path d="M-89 134L-95 194L-70 231L-35 231L-48.5 221A35 35 0 0 1-63 156L-74.5 151Z" />
                <path d="M89 134L95 194L70 231L35 231L48.5 221A35 35 0 0 0 63 156L74.5 151Z" />
                <circle cx="-45.5" cy="186" r="18" />
                <circle cx="45.5" cy="186" r="18" />
                <path d="M0 197L15 213L0 238L-15 213Z" />
              </g>
            </g>
          </mask>
        </defs>
        <g fill="currentColor">
          <path d={HEAD} mask="url(#owl-face)" />
          <path d="M-90 220L-110.5 303L-91 337L-66 277ZM90 220L110.5 303L91 337L66 277ZM-70 240L0 262L70 240L0 403ZM-62 291L-84 348L-8.5 407ZM62 291L84 348L8.5 407Z" />
        </g>
      </svg>
      {label}
    </div>
  );
}
