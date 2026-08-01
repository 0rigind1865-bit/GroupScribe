import { getDb } from '@/db';
import { liffUser } from '@/core/liff';
import { isPlatformOwner, orgAdminAccess, type OrgAccess } from '@/org/orgs';

// 考勤授權的唯一收口（比照 /api/liff/item 的三重把關）：
//   1) session 有效（gs_liff 簽章）→ 2) 身分屬於該 org → 3) 查詢一律綁 org_id
// 員工 id 永遠從 session 反查，絕不信任表單傳入的 employee_id。

export type Employee = {
  id: string;
  org_id: string;
  line_user_id: string;
  display_name: string;
  email: string | null;
  picture_url: string | null;
  dept: string | null;
  monthly_salary: number;
  status: 'pending' | 'active' | 'disabled';
  created_at: string;
};

/** 目前 LIFF 使用者的員工列（可能跨多 org；依建立時間序） */
export async function myEmployees(): Promise<Employee[]> {
  const uid = await liffUser();
  if (!uid) return [];
  const { data } = await getDb()
    .from('employees')
    .select('*')
    .eq('line_user_id', uid)
    .order('created_at');
  return (data ?? []) as Employee[];
}

/** 員工寫入操作（打卡/補卡）的授權：回 active 員工列，否則 null */
export async function activeEmployee(orgId?: string): Promise<Employee | null> {
  const all = await myEmployees();
  const scoped = orgId ? all.filter((e) => e.org_id === orgId) : all;
  return scoped.find((e) => e.status === 'active') ?? null;
}

/** org 管理端點的授權（平台擁有者或 org_members）；回 null 由呼叫端 404 */
export { orgAdminAccess, isPlatformOwner };
export type { OrgAccess };
