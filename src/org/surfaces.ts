import { cache } from 'react';
import { getDb } from '@/db';
import { liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { isPlatformOwner } from './orgs';
import { enabledModuleIds } from './module-ids';

// 全站「你能去哪些地方」的單一判定點。
//
// 為什麼需要它：使用者同時可能是群組成員、員工、org 管理員、平台擁有者，
// 原本這四個身分各有各的落點（/g、/a、/o/x/attend、/o/main），彼此只靠
// /g 上兩張卡片手動連著——沒有任何一個畫面能回答「我還能去哪」。
// 這裡把四個面向收成一份清單，root 頁用它決定落地、切換器用它列出全部。
//
// 命名依角色（使用者定調）：前兩個是員工視角、後兩個是管理者視角，
// 一眼看得出這是「換身分」而不是「換功能」。

export type SurfaceId = 'groups' | 'punch' | 'gs' | 'attend';

export type Surface = {
  id: SurfaceId;
  label: string;
  href: string;
  /** 落地優先序：數字小的先（員工的日常動作優先於管理動作） */
  rank: number;
};

export type Surfaces = {
  list: Surface[];
  /** 沒有任何面向＝這個 LINE 帳號與本系統無關（例如剛被踢出群組又不是員工） */
  landing: string | null;
};

/**
 * 目前使用者可用的面向。同一次請求裡 root 頁與切換器都會問，cache() 去重。
 *
 * 判定成本：liffUser（cookie 驗簽）+ 最多三次查詢（employees / org_members / groups）。
 * 全部走既有的快取路徑，且只在 root 頁與殼頂欄各一次。
 */
export const surfaces = cache(async (): Promise<Surfaces> => {
  const uid = await liffUser();
  const owner = await isPlatformOwner();
  const list: Surface[] = [];

  // 1. 員工身分 → 打卡
  const employees = uid ? await myEmployees() : [];
  const activeEmp = employees.find((e) => e.status === 'active') ?? employees[0];
  if (activeEmp) list.push({ id: 'punch', label: '我要打卡', href: '/a', rank: 1 });

  const db = getDb();

  // 2. 群組成員 → 成員版。這裡刻意不逐群呼叫 LINE 成員 API（那是 /g 自己的事，
  //    且有 10 分鐘快取）；只要「曾在某群發過言或是員工」就給入口，實際能看哪幾群由 /g 判定。
  if (uid) {
    const { data } = await db.from('messages').select('id').eq('sender_id', uid).limit(1);
    if (data?.length || activeEmp) list.push({ id: 'groups', label: '我的群組', href: '/g', rank: 2 });
  }

  // 3. org 管理員 → 依 org_settings.modules 給管理面向（平台擁有者用 main 且全開；其餘查 org_members）
  //    ponytail: 只取第一個 org；同一人管多個 org 時切換器只列一個，有需求再展開
  let adminSlug: string | null = null;
  let mods = new Set<string>(['gs', 'attend']);
  if (owner) {
    adminSlug = process.env.DEFAULT_ORG_SLUG ?? 'main';
  } else if (uid) {
    const { data } = await db.from('org_members').select('orgs(slug, org_settings(modules))').eq('line_user_id', uid).limit(1);
    const o = (data?.[0] as { orgs?: { slug?: string; org_settings?: { modules?: unknown } | null } } | undefined)?.orgs;
    adminSlug = o?.slug ?? null;
    mods = new Set<string>(enabledModuleIds(o?.org_settings?.modules));
  }
  if (adminSlug) {
    // 群組管理排在考勤管理前面：平台擁有者（用密碼登入、沒有 LINE 身分）的主場是群組助理，
    // 落在考勤對他是錯的。只有考勤權限的 org 管理員不受影響——他只有一個面向。
    if (mods.has('gs')) list.push({ id: 'gs', label: '群組管理', href: `/o/${adminSlug}`, rank: 3 });
    if (mods.has('attend')) list.push({ id: 'attend', label: '考勤管理', href: `/o/${adminSlug}/attend`, rank: 4 });
  }

  list.sort((a, b) => a.rank - b.rank);
  return { list, landing: list[0]?.href ?? null };
});
