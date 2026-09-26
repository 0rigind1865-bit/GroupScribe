// 從 Snaptab lib/icons.tsx 搬來（報帳全功能移植）：線性 icon，分類圖示存 key（如 'gas'）。
// 群記另加 defaultIconFor()：公司沒設圖示的分類，依名稱猜一個。

import type { ReactNode } from 'react';
import { normalizeIcon } from './icon-names';

export { CATEGORY_ICONS, defaultIconFor, normalizeIcon } from './icon-names';

/** 每個 icon 的 SVG 內容(24 格、stroke currentColor)。 */
const ICON_PATHS: Record<string, ReactNode> = {
  // ── 分類用 ──────────────────────────────
  gas: (
    <>
      <rect x='3' y='4' width='9' height='16' rx='1.5' />
      <line x1='2' y1='20' x2='13' y2='20' />
      <rect x='5.5' y='6.5' width='4' height='3.5' rx='0.5' />
      <path d='M12 11h2.5A1.5 1.5 0 0 1 16 12.5V16a1.5 1.5 0 0 0 3 0V10l-2.5-2.5' />
    </>
  ),
  meal: (
    <>
      <path d='M3 18h18' />
      <path d='M5 18a7 7 0 0 1 14 0' />
      <line x1='12' y1='7.5' x2='12' y2='11' />
      <circle cx='12' cy='6.5' r='1' />
    </>
  ),
  parking: (
    <>
      <rect x='3.5' y='3.5' width='17' height='17' rx='3.5' />
      <path d='M9.5 17V7.5h3.2a2.75 2.75 0 0 1 0 5.5H9.5' />
    </>
  ),
  toll: (
    <>
      <path d='M6 20 8.5 4M18 20 15.5 4' />
      <path d='M12 5v2.5M12 10.75v2.5M12 16.5V19' />
    </>
  ),
  hotel: (
    <>
      <path d='M3 9v10' />
      <path d='M3 13h15a3 3 0 0 1 3 3v3' />
      <line x1='3' y1='19' x2='21' y2='19' />
      <path d='M6.5 13v-1.5a1.5 1.5 0 0 1 1.5-1.5h1.5A1.5 1.5 0 0 1 11 11.5V13' />
    </>
  ),
  misc: (
    <path d='M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' />
  ),
  drink: (
    <>
      <path d='M6 8h12l-1.2 12.1a1 1 0 0 1-1 .9H8.2a1 1 0 0 1-1-.9z' />
      <path d='M5 8h14' />
      <line x1='14.5' y1='3' x2='12.5' y2='8' />
    </>
  ),
  coffee: (
    <>
      <path d='M18 8h1a4 4 0 0 1 0 8h-1' />
      <path d='M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z' />
      <line x1='6' y1='2' x2='6' y2='4.5' />
      <line x1='10' y1='2' x2='10' y2='4.5' />
      <line x1='14' y1='2' x2='14' y2='4.5' />
    </>
  ),
  tool: (
    <path d='M14.7 6.3a4 4 0 0 0-5.4 5.4l-6.6 6.6a1.5 1.5 0 0 0 2.1 2.1l6.6-6.6a4 4 0 0 0 5.4-5.4l-2.7 2.7-2.1-2.1z' />
  ),
  cart: (
    <>
      <circle cx='9' cy='20' r='1.4' />
      <circle cx='18' cy='20' r='1.4' />
      <path d='M2.5 3h2.2l2.3 12.1a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L21 7H6' />
    </>
  ),
  box: (
    <>
      <path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' />
      <polyline points='3.3 7 12 12 20.7 7' />
      <line x1='12' y1='22' x2='12' y2='12' />
    </>
  ),
  ticket: (
    <>
      <rect x='3' y='6' width='18' height='12' rx='2' />
      <line x1='13' y1='6' x2='13' y2='18' strokeDasharray='2 2.5' />
    </>
  ),
  receipt: (
    <>
      <path d='M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5z' />
      <line x1='8.5' y1='8' x2='15.5' y2='8' />
      <line x1='8.5' y1='12' x2='15.5' y2='12' />
    </>
  ),
  car: (
    <>
      <path d='M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11' />
      <path d='M3 11h18v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7.5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z' />
    </>
  ),
  truck: (
    <>
      <rect x='1.5' y='6' width='13' height='9' rx='1' />
      <path d='M14.5 9h3.5l3 3v3h-6.5z' />
      <circle cx='6' cy='18' r='1.6' />
      <circle cx='18' cy='18' r='1.6' />
    </>
  ),
  plane: <path d='M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z' />,
  tag: (
    <>
      <path d='M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z' />
      <circle cx='7' cy='7' r='1.1' />
    </>
  ),

  // ── 介面控制用 ──────────────────────────
  camera: (
    <>
      <path d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z' />
      <circle cx='12' cy='13' r='3.5' />
    </>
  ),
  mic: (
    <>
      <rect x='9' y='2' width='6' height='12' rx='3' />
      <path d='M5 11a7 7 0 0 0 14 0' />
      <line x1='12' y1='18' x2='12' y2='22' />
    </>
  ),
  stop: <rect x='6.5' y='6.5' width='11' height='11' rx='2' fill='currentColor' stroke='none' />,
  scan: (
    <>
      <path d='M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2' />
      <line x1='4' y1='12' x2='20' y2='12' />
    </>
  ),
  trash: (
    <>
      <polyline points='3 6 5 6 21 6' />
      <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
      <line x1='10' y1='11' x2='10' y2='17' />
      <line x1='14' y1='11' x2='14' y2='17' />
    </>
  ),
  edit: (
    <>
      <path d='M12 20h9' />
      <path d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' />
    </>
  ),
  list: (
    <>
      <line x1='8' y1='6' x2='21' y2='6' />
      <line x1='8' y1='12' x2='21' y2='12' />
      <line x1='8' y1='18' x2='21' y2='18' />
      <circle cx='3.5' cy='6' r='1' />
      <circle cx='3.5' cy='12' r='1' />
      <circle cx='3.5' cy='18' r='1' />
    </>
  ),
  pin: (
    <>
      <path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' />
      <circle cx='12' cy='10' r='3' />
    </>
  ),
  sliders: (
    <>
      <line x1='4' y1='21' x2='4' y2='14' />
      <line x1='4' y1='10' x2='4' y2='3' />
      <line x1='12' y1='21' x2='12' y2='12' />
      <line x1='12' y1='8' x2='12' y2='3' />
      <line x1='20' y1='21' x2='20' y2='16' />
      <line x1='20' y1='12' x2='20' y2='3' />
      <line x1='1.5' y1='14' x2='6.5' y2='14' />
      <line x1='9.5' y1='8' x2='14.5' y2='8' />
      <line x1='17.5' y1='16' x2='22.5' y2='16' />
    </>
  ),
  download: (
    <>
      <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
      <polyline points='7 10 12 15 17 10' />
      <line x1='12' y1='15' x2='12' y2='3' />
    </>
  ),
  image: (
    <>
      <rect x='3' y='3' width='18' height='18' rx='2' />
      <circle cx='8.5' cy='8.5' r='1.5' />
      <polyline points='21 15 16 10 5 21' />
    </>
  ),
  sun: (
    <>
      <circle cx='12' cy='12' r='4.5' />
      <line x1='12' y1='1.5' x2='12' y2='4' />
      <line x1='12' y1='20' x2='12' y2='22.5' />
      <line x1='3.5' y1='3.5' x2='5.5' y2='5.5' />
      <line x1='18.5' y1='18.5' x2='20.5' y2='20.5' />
      <line x1='1.5' y1='12' x2='4' y2='12' />
      <line x1='20' y1='12' x2='22.5' y2='12' />
      <line x1='3.5' y1='20.5' x2='5.5' y2='18.5' />
      <line x1='18.5' y1='5.5' x2='20.5' y2='3.5' />
    </>
  ),
  moon: <path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' />,
  chart: (
    <>
      <line x1='3' y1='21' x2='21' y2='21' />
      <rect x='5' y='11' width='3.4' height='7.5' rx='0.6' />
      <rect x='10.3' y='6' width='3.4' height='12.5' rx='0.6' />
      <rect x='15.6' y='14' width='3.4' height='4.5' rx='0.6' />
    </>
  ),
  sparkles: (
    <>
      <path d='M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z' />
      <path d='M18.5 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z' />
    </>
  ),
};

/** 線性 icon。name 可為 icon key 或舊 emoji(自動正規化)。 */
export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.75,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const key = normalizeIcon(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={strokeWidth}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      style={{ display: 'block', flexShrink: 0 }}
    >
      {ICON_PATHS[key]}
    </svg>
  );
}

/** 不需正規化、直接指定 key 的版本(介面控制用,如 sun/moon/camera)。 */
export function UiIcon(props: {
  name: keyof typeof ICON_PATHS;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return <Icon {...props} />;
}

