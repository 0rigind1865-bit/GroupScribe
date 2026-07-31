import type { ItemMedia } from '@/core/media';

// 項目的同時段照片／檔案縮圖（管理版詳情卡與 LIFF 成員視圖共用）
export function ItemPhotos({ items, compact = false }: { items?: ItemMedia[]; compact?: boolean }) {
  if (!items?.length) return null;
  const size = compact ? 'h-14 w-14' : 'h-20 w-20';
  return (
    <div className={compact ? 'mt-1.5' : 'mt-3'}>
      <p className="mb-1 text-xs text-gray-400">同時段的照片／檔案</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" title="開啟原檔">
            {m.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className={`${size} rounded border border-gray-200 object-cover`} />
            ) : (
              <span className={`${size} flex items-center justify-center rounded border border-gray-200 bg-gray-100 text-gray-400`}>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2h8l4 4v16H6z" />
                  <path d="M14 2v4h4M9 13h6M9 17h6" />
                </svg>
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
