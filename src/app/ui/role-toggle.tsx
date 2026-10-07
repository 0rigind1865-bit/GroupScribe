import { ROLE_ICON, type Tt } from '@/org/surface-meta';
import type { Side } from '@/org/surface-groups';

// 角色開關（個人｜管理）：IdentityBar 裡那顆就是它；也單獨給頂欄左邊不是工具按鈕的頁面用——
// 成員群組頁左邊是「‹ 群組名」、右邊是開關（2026-10 設計畫布「成員端」）。
// 配色（含深色模式）掛在 .id-bar--light／.id-bar--dark 底下，外層要帶其中一個 class。
// 只有兩個角色都有的人才該渲染（hasRoleToggle 由呼叫端判斷）：群組裡別家公司的人不該知道有「管理」。
export function RoleToggle({ side, from, tt, dot }: { side: Side; from: string; tt: Tt; dot?: boolean | string }) {
  return (
    <nav className="id-toggle" aria-label={tt('SWITCH_ROLE')}>
      {(['me', 'admin'] as const).map((r) => {
        const inner = (
          <>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ROLE_ICON[r]}
            </svg>
            {tt(r === 'me' ? 'ROLE_ME' : 'ROLE_ADMIN')}
          </>
        );
        return r === side ? (
          <span key={r} className="id-role" aria-current="page">
            {inner}
          </span>
        ) : (
          // 小點給字串＝直達有事的那個管理工具（同 IdentityBar，T10 第 1 輪）
          <a key={r} className="id-role" href={`/go/${r === 'admin' && typeof dot === 'string' ? encodeURIComponent(dot) : `@${r}`}?from=${encodeURIComponent(from)}`}>
            {inner}
            {r === 'admin' && dot && <span className="id-dot" role="img" aria-label={tt('HAS_PENDING')} />}
          </a>
        );
      })}
    </nav>
  );
}
