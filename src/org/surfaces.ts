import { cache } from 'react';
import { getDb } from '@/db';
import { liffUser, myGroups } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { isPlatformOwner } from './orgs';
import { enabledModuleIds } from './module-ids';

// 全站「你能去哪些地方」的單一判定點。
//
// 為什麼需要它：使用者同時可能是群組成員、員工、org 管理員、平台擁有者，
// 所有人都從同一個 LINE 連結（LIFF）進來。這裡把身分收成一份清單：
//   首頁（src/app/page.tsx）：一種身分直接進去；兩種以上顯示選單、記住上次選的
//   切換器（SurfaceSwitcher）與「更多」頁：列出全部，一鍵換身分（經 /go/[key] 記住選擇）
//
// 身分怎麼判定（全部以 LINE 帳號編號為準，每次請求重查，撤權立即生效）：
//   我要打卡  ＝ employees 有這個 LINE 帳號
//   我的群組  ＝ 他「現在」在某個已認領的群裡（LINE 群成員 API，見 core/liff.ts myGroups）
//   群組管理／考勤管理 ＝ org_members 有他（每個 org 各一組，依該 org 開的模組）；平台擁有者另加預設 org 全開
//   平台管理 ＝ 平台擁有者（後台密碼，或 ADMIN_LINE_USER_ID 的 LINE 帳號）

export type SurfaceId = 'groups' | 'punch' | 'gs' | 'attend' | 'platform';

export type Surface = {
  key: string; // 唯一：同一人管多個 org 時 gs/attend 會各有一組（'gs:acme'）
  id: SurfaceId;
  label: string;
  desc: string; // 首頁選單的說明
  href: string;
  slug?: string; // 管理面向所屬的 org
  /** 排序：數字小的先（員工的日常動作優先於管理動作） */
  rank: number;
};

export type Surfaces = {
  list: Surface[];
  /** 沒有任何面向＝這個 LINE 帳號與本系統無關（例如剛被踢出群組又不是員工） */
  landing: string | null;
};

type OrgRow = { slug: string; name: string; modules: Set<string> };

export const surfaces = cache(async (): Promise<Surfaces> => {
  const uid = await liffUser();
  const owner = await isPlatformOwner();
  const list: Surface[] = [];
  const db = getDb();

  // 1. 員工 → 打卡
  const employees = uid ? await myEmployees() : [];
  if (employees.length) {
    list.push({ key: 'punch', id: 'punch', label: '我要打卡', desc: '上下班打卡、看打卡紀錄、申請補卡', href: '/a', rank: 1 });
  }

  // 2. 群組成員 → 成員版（以「現在在不在群裡」為準，不是「有沒有講過話」）
  if (uid && (await myGroups(uid, { first: true })).length) {
    list.push({ key: 'groups', id: 'groups', label: '我的群組', desc: '看你所在群組的行程、待辦、公告，順手確認 AI 整理的內容', href: '/g', rank: 2 });
  }

  // 3. 管理員 → 每個 org 各一組（依該 org 開的模組）
  const orgs: OrgRow[] = [];
  if (owner) {
    const slug = process.env.DEFAULT_ORG_SLUG ?? 'main';
    const { data } = await db.from('orgs').select('name').eq('slug', slug).maybeSingle();
    orgs.push({ slug, name: data?.name ?? slug, modules: new Set(['gs', 'attend']) });
  }
  if (uid) {
    const { data } = await db.from('org_members').select('orgs(slug, name, org_settings(modules))').eq('line_user_id', uid);
    for (const r of data ?? []) {
      const o = (r as { orgs?: { slug?: string; name?: string; org_settings?: { modules?: unknown } | null } }).orgs;
      if (!o?.slug || orgs.some((x) => x.slug === o.slug)) continue;
      orgs.push({ slug: o.slug, name: o.name ?? o.slug, modules: new Set(enabledModuleIds(o.org_settings?.modules)) });
    }
  }
  const many = orgs.length > 1; // 管多家時名稱要帶公司名，否則分不出來
  orgs.forEach((o, i) => {
    const tail = many ? `・${o.name}` : '';
    // 群組管理排在考勤管理前面：平台擁有者（用密碼登入、沒有 LINE 身分）的主場是群組助理
    if (o.modules.has('gs'))
      list.push({ key: `gs:${o.slug}`, id: 'gs', slug: o.slug, label: `群組管理${tail}`, desc: '收件匣把關、所有群的今天總覽、群組與方案設定', href: `/o/${o.slug}`, rank: 3 + i * 0.01 });
    if (o.modules.has('attend'))
      list.push({ key: `attend:${o.slug}`, id: 'attend', slug: o.slug, label: `考勤管理${tail}`, desc: '員工管理、補卡審核、打卡報表與薪資', href: `/o/${o.slug}/attend`, rank: 4 + i * 0.01 });
  });

  // 4. 平台擁有者 → 平台管理（所有公司、未認領的群、改方案）
  if (owner) list.push({ key: 'platform', id: 'platform', label: '平台管理', desc: '所有公司、未認領的群、方案與用量', href: '/platform', rank: 5 });

  list.sort((a, b) => a.rank - b.rank);
  return { list, landing: list[0]?.href ?? null };
});
