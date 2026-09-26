import { getDb } from '@/db';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces } from '@/org/surface-groups';
import { hasAdminPending } from '@/org/pending';
import type { Locale } from '@/attend/i18n';

// 員工端各頁共用的外框資料：身分列要的分組、琥珀小點、多家公司時的公司名。
// 放在頁面層（server），AttendShell 本身保持同步純元件（tests/identity-bar.test.ts 能直接渲染）。
export async function shellData(uid: string, emp?: { org_id: string } | null, employees: { org_id: string }[] = []) {
  const groups = groupSurfaces((await surfaces()).list);
  const multi = emp && new Set(employees.map((e) => e.org_id)).size > 1;
  const [dot, org] = await Promise.all([
    hasAdminPending(groups, uid),
    multi
      ? getDb()
          .from('orgs')
          .select('name')
          .eq('id', emp!.org_id)
          .maybeSingle()
          .then((r) => (r.data as { name?: string } | null)?.name)
      : Promise.resolve(undefined),
  ]);
  // 「回群組」只給真的在群組裡的人（待啟用的員工多半不在任何群，按下去是空頁——審查 F11、F34）
  return { groups, dot, org, inGroups: groups.me.some((s) => s.id === 'groups') };
}

/** 頁標題旁的今天日期（依語系，台灣時間） */
export const todayLabel = (loc: Locale) =>
  new Intl.DateTimeFormat(loc, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' }).format(new Date());
