import { redirect } from 'next/navigation';

// 單群頁面（月曆／待辦／公告／檔案）的群組解析。
// 網址沒帶 ?group= 時，選第一個群組並**補進網址再重新導向**——不補的話頂欄切換器只認網址參數，
// 會顯示「選擇群組…」而頁面標題同時顯示群組名，同一畫面兩個矛盾的狀態
// （principles.md：別讓我想）。順手讓網址可分享、可加書籤。
// 其餘 query 參數（view / note / task / category…）原封不動帶過去。
export function scopedGroup(
  path: string,
  params: Record<string, string | undefined>,
  groups: { group_id: string }[],
): string | undefined {
  const cur = params.group;
  const found = cur && groups.some((g) => g.group_id === cur) ? cur : groups[0]?.group_id;
  if (found && found !== cur) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, group: found })) if (v) q.set(k, v);
    redirect(`${path}?${q.toString()}`);
  }
  return found;
}
