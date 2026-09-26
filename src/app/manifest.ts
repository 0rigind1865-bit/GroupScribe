import type { MetadataRoute } from 'next';

// PWA 最低基礎（商業計劃 P1）：讓管理者能「加到主畫面」。不做 service worker／離線——沒有需求。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '群記 GroupScribe',
    short_name: '群記',
    description: '把 LINE 工作群的對話整理成行程、待辦和公告。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#f9fafb',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
