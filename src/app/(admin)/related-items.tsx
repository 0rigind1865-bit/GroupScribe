import type { RelatedItem } from '@/core/links';

// 著色依「類型」以利一眼分辨，沿用既有語意色盤（事件 emerald、公告/決議 purple；待辦 app 內無專色，取 sky）
const TONE: Record<RelatedItem['type'], string> = {
  event: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200',
  task: 'bg-sky-100 text-sky-900 hover:bg-sky-200',
  note: 'bg-purple-100 text-purple-900 hover:bg-purple-200',
};

// 詳情卡「相關項目」反向連結區＝Obsidian backlinks 面板等價物：
// 列出與本項目共享來源訊息的其他事件/待辦/公告，點 chip 跳各自詳情（換 query param 重載，維持 MPA）。
// 無關聯就整區不渲染，保持卡片乾淨。
export function RelatedItems({ items }: { items: RelatedItem[] }) {
  if (!items.length) return null;
  return (
    <>
      <h3 className="mt-4 mb-2 text-sm font-bold text-gray-600">
        相關項目 <span className="font-normal text-gray-400">（共享來源訊息）</span>
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((r) => (
          <li key={`${r.type}-${r.id}`} className="min-w-0">
            <a
              href={r.href}
              title={r.shared > 1 ? `共享 ${r.shared} 則來源訊息` : undefined}
              className={`flex max-w-full items-baseline gap-1 truncate rounded px-2 py-1 text-xs ${TONE[r.type]}`}
            >
              <span className="font-semibold">{r.tag}</span>
              <span className="truncate">{r.title}</span>
              {r.label && <span className="opacity-70">｜{r.label}</span>}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
