import { surfaces, type SurfaceId } from '@/org/surfaces';

// 面向切換器：全站唯一「我還能去哪」的答案。
//
// 取代原本只涵蓋 /o/[org] 底下兩格的 WorkspaceSwitcher——那時 /g 與 /a 在體系外，
// 管理員想看員工畫面得先回 /g 再點卡片，而使用者第一次找打卡入口就卡在這裡。
//
// 命名依角色（使用者定調）：我的群組・我要打卡＝員工視角；群組管理・考勤管理＝管理者視角。
// 一眼看得出這是換身分，不是換功能。
//
// 只有一個面向時整條不渲染——沒有選擇就不該佔一列，也不洩漏「還有別的地方」
// （權限邊界：群組裡別家公司的人不該知道考勤存在）。
// slug：管理面向所屬的 org（同一人管多家時，同類的膠囊會有好幾顆，靠 slug 分出目前這顆）
export async function SurfaceSwitcher({ current, slug }: { current: SurfaceId; slug?: string }) {
  const { list } = await surfaces();
  if (list.length < 2) return null;
  return (
    <nav className="flex gap-0.5 overflow-x-auto rounded-full bg-gray-100 p-0.5 text-sm" aria-label="切換面向">
      {list.map((s) => {
        const on = s.id === current && (!s.slug || !slug || s.slug === slug);
        return (
          // 經 /go 記住這次的選擇：下次從 LINE 打開首頁直接回到這裡
          <a
            key={s.key}
            href={`/go/${encodeURIComponent(s.key)}`}
            aria-current={on ? 'page' : undefined}
            className={`rounded-full px-3 py-1 font-bold whitespace-nowrap ${
              on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
