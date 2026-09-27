import { getDb } from '@/db';
import { orgBySlug, orgGroups } from './orgs';
import { hasRoleToggle, type Grouped } from './surface-groups';

// 身分列「管理」格上的琥珀小點：你在個人那一邊時，告訴你「公司那邊有事等你」（審查 F30）。
//
// 不帶數字——數字在管理端各頁自己的徽章上；只回「哪個工具有事」讓小點直達。所以查詢一律用存在性（limit 1），
// 最多看 3 家公司、命中一個就停，並以 LINE 帳號快取 60 秒：
// 打卡頁是員工在 LINE 內建瀏覽器、最慢的網路下開的，不能為了一顆點多跑十幾個 count。
const TTL = 60_000;
const cache = new Map<string, { v: string | null; at: number }>();

/** 第一個有待辦的管理工具 key（例如 'gs:acme'）；沒有就 null。
 *  回 key 而不是布林：點亮著的「管理」要直達有事的那個工具，不是「同工具對應」落到沒事的地方（T10 第 1 輪） */
export async function adminPendingKey(g: Grouped, uid: string): Promise<string | null> {
  if (!hasRoleToggle(g)) return null;
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const v = await check(g, uid);
  cache.set(uid, { v, at: Date.now() });
  return v;
}

async function check(g: Grouped, uid: string): Promise<string | null> {
  const db = getDb();
  const exists = async (q: PromiseLike<{ data: unknown[] | null }>) => ((await q).data?.length ?? 0) > 0;
  // 只看「自己的」公司：真的是 org_members 的那幾家＋預設公司。平台擁有者的清單列著所有客戶，
  // 不篩的話小點會把他帶去客戶的收件匣（最後審查）
  const { data: rows } = await db.from('org_members').select('orgs(slug)').eq('line_user_id', uid);
  const mine = new Set<string>([process.env.DEFAULT_ORG_SLUG ?? 'main']);
  for (const r of (rows ?? []) as { orgs?: { slug?: string } | null }[]) if (r.orgs?.slug) mine.add(r.orgs.slug);
  for (const o of g.admin.filter((x) => mine.has(x.slug)).slice(0, 3)) {
    const org = await orgBySlug(o.slug);
    if (!org) continue;
    const ids = new Set(o.items.map((i) => i.id));
    if (ids.has('attend')) {
      if (await exists(db.from('adjustment_requests').select('id').eq('org_id', org.id).eq('status', 'pending').limit(1))) return `attend:${o.slug}`;
      if (await exists(db.from('employees').select('id').eq('org_id', org.id).eq('status', 'pending').limit(1))) return `attend:${o.slug}`;
    }
    if (ids.has('gs')) {
      const groupIds = (await orgGroups(org.id)).map((x) => x.group_id);
      if (!groupIds.length) continue;
      for (const [table, status] of [
        ['tasks', 'open'],
        ['notes', 'active'],
      ] as const)
        if (await exists(db.from(table).select('id').in('group_id', groupIds).eq('needs_confirmation', true).eq('status', status).limit(1))) return `gs:${o.slug}`;
      if (await exists(db.from('events').select('id').in('group_id', groupIds).eq('needs_confirmation', true).neq('status', 'ignored').limit(1))) return `gs:${o.slug}`;
    }
  }
  return null;
}
