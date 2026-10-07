import type { ReactNode } from 'react';

// AI 寫的簡易 markdown（群組理解摘要是「- **產業與業務**：…」這種條列）：只認粗體 **…** 與「- 」「* 」條列，
// 其餘照原文一行一段。不拼 HTML、不用 dangerouslySetInnerHTML——全部是 React 文字節點，
// 內容（AI 寫的或人手改的）裡就算有 <script> 也只會顯示成字。
const bold = (s: string): ReactNode[] => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: ReactNode[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>);
    items = [];
  };
  for (const line of text.split('\n')) {
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      items.push(<li key={items.length}>{bold(li[1])}</li>);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{bold(line.trim())}</p>);
  }
  flush();
  return <>{blocks}</>;
}
