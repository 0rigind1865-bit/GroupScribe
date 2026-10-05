import { getDb } from '@/db';
import { getConnector } from './config';
import { liffUrl } from './ingest';
import { isAdminLineUser, isGroupMember } from './liff';

// 每日摘要（計劃 B.8）：1:1 私訊給「自己訂閱的人」，群組永遠零聲量。
// 只在該群今天真的有事時才推——沒事還發訊息，訂閱很快就會被關掉。
// 由 NAS cron 打 POST /api/digest 觸發；同日重複呼叫由 last_sent_on 擋掉。
//
// 一個人一天只收一則：訂了好幾個群的人，有事的群合成一則（2026-10-05）。
// LINE 推播按「收件人次」計費（商業計劃 K7），一人訂 10 個群原本每天 10 則、10 次費用；
// 合併後每日提醒名額（src/org/digest-seats.ts，以人計）就真的等於推播成本。

export interface DigestStats {
  subscribers: number; // 有開提醒的人
  subscriptions: number; // 訂閱數（人 × 群）
  sent: number; // 實際推出的訊息數（一人一則）
  groupsSent: number; // 這些訊息裡總共含幾個群
  skippedEmpty: number; // 這個人訂的群今天都沒事，不打擾
  skippedSent: number; // 今天已推過
  disabled: number; // 退群／封鎖／未加好友 → 自動停用的訂閱數
}

// LINE 文字訊息上限 5,000 字（connectors/line.ts 推送時切在 4,900）。
// 自己先留餘裕排版：超過就少放幾個群、改成一行「還有哪些群」，不能讓連結被切掉
const MAX_CHARS = 4500;
// 每一類最多列幾筆：一個群幾十筆逾期待辦時，訊息不該被它一個群吃光
const MAX_ITEMS = 6;

export type DigestSection = {
  groupId: string;
  name: string;
  events: { title: string; time: string | null; location: string | null }[];
  tasks: { title: string; dueAt: string; assignee: string | null }[];
  pending: number; // 待確認筆數（只算給平台擁有者看）
  inboxUrl: string | null;
  url: string | null;
};

const more = (n: number) => (n > 0 ? [`・還有 ${n} 筆`] : []);

/** 一個群的內容（不含群名與連結）；今天沒事回空陣列 */
export function sectionLines(s: DigestSection, today: string): string[] {
  const lines: string[] = [];
  if (s.events.length) {
    lines.push('📅 今日行程');
    for (const e of s.events.slice(0, MAX_ITEMS)) {
      const meta = [e.time ? e.time.slice(0, 5) : '時間未定', e.location].filter(Boolean).join(' · ');
      lines.push(`・${e.title}（${meta}）`);
    }
    lines.push(...more(s.events.length - MAX_ITEMS));
  }
  if (s.tasks.length) {
    if (lines.length) lines.push('');
    lines.push('✅ 到期待辦');
    for (const t of s.tasks.slice(0, MAX_ITEMS)) {
      const due = t.dueAt < today ? `逾期 ${t.dueAt.slice(5).replace('-', '/')}` : '今天到期';
      lines.push(`・${t.title}（${due}${t.assignee ? ` · ${t.assignee}` : ''}）`);
    }
    lines.push(...more(s.tasks.length - MAX_ITEMS));
  }
  if (s.pending > 0) {
    if (lines.length) lines.push('');
    // 確認要在管理收件匣做；成員版（下面的「詳細內容」）看得到卻按不了確認
    lines.push(`⚠️ ${s.pending} 筆待你確認${s.inboxUrl ? `\n去確認 👉 ${s.inboxUrl}` : ''}`);
  }
  return lines;
}

/**
 * 一個人今天的整則訊息。只有一個群有事時，格式與合併前完全一樣；
 * 好幾個群時依群名排序、一群一段，放不下的群收成最後一行（附群組列表連結）。
 * 全部沒事回 null。回傳 included＝真的放進訊息的群（只有這些標記「今天已送」）。
 */
export function composeDigest(
  sections: DigestSection[],
  today: string,
  listUrl: string | null,
  maxChars = MAX_CHARS,
): { text: string; included: string[] } | null {
  const live = sections.filter((s) => sectionLines(s, today).length);
  if (!live.length) return null;

  if (live.length === 1) {
    const s = live[0];
    const text = [`【${s.name}】今日摘要`, '', ...sectionLines(s, today), ...(s.url ? ['', `詳細內容 👉 ${s.url}`] : [])].join('\n');
    return { text, included: [s.groupId] };
  }

  const sorted = [...live].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const head = `今日摘要・${sorted.length} 個群`;
  const blocks: string[] = [];
  const included: string[] = [];
  const left: DigestSection[] = [];
  const tail = (rest: DigestSection[]) =>
    rest.length ? `\n\n還有 ${rest.length} 個群今天也有事：${rest.map((s) => s.name).join('、')}${listUrl ? `\n全部 👉 ${listUrl}` : ''}` : '';

  for (const [i, s] of sorted.entries()) {
    const block = [`【${s.name}】`, ...sectionLines(s, today), ...(s.url ? [`👉 ${s.url}`] : [])].join('\n');
    const draft = [head, ...blocks, block].join('\n\n') + tail(sorted.slice(i + 1));
    // 第一個群一定放（再長也比只寄一行「還有哪些群」有用）；之後放不下就收進最後一行
    if (blocks.length && draft.length > maxChars) {
      left.push(...sorted.slice(i));
      break;
    }
    blocks.push(block);
    included.push(s.groupId);
  }
  return { text: [head, ...blocks].join('\n\n') + tail(left), included };
}

type Sub = { group_id: string; line_user_id: string; last_sent_on: string | null; fail_count: number | null };

export async function runDailyDigest(): Promise<DigestStats> {
  const db = getDb();
  const stats: DigestStats = { subscribers: 0, subscriptions: 0, sent: 0, groupsSent: 0, skippedEmpty: 0, skippedSent: 0, disabled: 0 };
  const connector = getConnector();
  if (!connector.push) return stats; // 平台不支援主動推送

  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('group_id, line_user_id, last_sent_on, fail_count')
    .eq('enabled', true);
  if (error) throw new Error(`讀取訂閱失敗（migration 009 跑了嗎？）：${error.message}`);

  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.line_user_id, [...(byUser.get(s.line_user_id) ?? []), s]);
  stats.subscriptions = subs?.length ?? 0;
  stats.subscribers = byUser.size;

  const now = () => new Date().toISOString();
  const sectionCache = new Map<string, DigestSection | null>(); // 同群多人訂閱只查一次
  const listUrl = liffUrl({ src: 'digest' }); // 成員版群組列表：放不下的群從這裡進

  for (const [uid, mine] of byUser) {
    const due = mine.filter((s) => s.last_sent_on !== today);
    if (!due.length) {
      stats.skippedSent++;
      continue;
    }
    const admin = isAdminLineUser(uid);
    const sections: DigestSection[] = [];
    for (const s of due) {
      // 退群的人不該再收到該群摘要（成員資格以 LINE 為權威，見 B.3）
      if (!(await isGroupMember(s.group_id, uid))) {
        await db.from('push_subscriptions').update({ enabled: false, updated_at: now() }).eq('group_id', s.group_id).eq('line_user_id', uid);
        stats.disabled++;
        continue;
      }
      const key = `${s.group_id}|${admin ? 'admin' : 'member'}`;
      if (!sectionCache.has(key)) sectionCache.set(key, await buildSection(s.group_id, today, admin));
      const sec = sectionCache.get(key);
      if (sec) sections.push(sec);
    }

    const msg = composeDigest(sections, today, listUrl);
    if (!msg) {
      stats.skippedEmpty++;
      continue;
    }

    const r = await connector.push(uid, msg.text);
    const sentRows = due.filter((s) => msg.included.includes(s.group_id));
    if (r === 'ok') {
      // 只標放進訊息的群：沒事的群今天之後才有事，同日重跑時還能補送
      await db.from('push_subscriptions').update({ last_sent_on: today, fail_count: 0, updated_at: now() })
        .eq('line_user_id', uid).in('group_id', msg.included);
      stats.sent++;
      stats.groupsSent += msg.included.length;
    } else if (r === 'blocked') {
      // 封鎖或解除好友是「人」層級：這個人的訂閱全部停用（使用者可在 LIFF 重新打開）
      await db.from('push_subscriptions').update({ enabled: false, updated_at: now() }).eq('line_user_id', uid);
      stats.disabled += mine.length;
    } else {
      for (const s of sentRows) {
        await db.from('push_subscriptions').update({ fail_count: (s.fail_count ?? 0) + 1, updated_at: now() })
          .eq('group_id', s.group_id).eq('line_user_id', uid);
      }
    }
  }
  return stats;
}

// 一個群今天的內容；查不到群或今天沒事回 null
async function buildSection(groupId: string, today: string, isAdmin: boolean): Promise<DigestSection | null> {
  const db = getDb();
  const [{ data: g }, { data: events }, { data: tasks }] = await Promise.all([
    db.from('groups').select('name, orgs(slug)').eq('group_id', groupId).maybeSingle(),
    db.from('events').select('title, start_time, location').eq('group_id', groupId)
      .eq('status', 'active').eq('starts_at', today).order('start_time', { nullsFirst: true }),
    db.from('tasks').select('title, assignee, due_at').eq('group_id', groupId)
      .eq('status', 'open').not('due_at', 'is', null).lte('due_at', today).order('due_at'),
  ]);

  let pending = 0;
  let inboxUrl: string | null = null;
  if (isAdmin) {
    const [ev, tk, nt] = await Promise.all([
      db.from('events').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).neq('status', 'ignored'),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).eq('status', 'open'),
      db.from('notes').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).eq('status', 'active'),
    ]);
    pending = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);
    const slug = (g as { orgs?: { slug?: string } | null } | null)?.orgs?.slug;
    inboxUrl = pending && slug ? liffUrl({ path: `/o/${slug}/inbox`, params: { group: groupId }, src: 'digest' }) : null;
  }

  const section: DigestSection = {
    groupId,
    name: g?.name ?? groupId,
    events: (events ?? []).map((e) => ({ title: e.title, time: e.start_time ? String(e.start_time) : null, location: e.location ?? null })),
    tasks: (tasks ?? []).map((t) => ({ title: t.title, dueAt: t.due_at, assignee: t.assignee ?? null })),
    pending,
    inboxUrl,
    url: liffUrl({ g: groupId, src: 'digest' }),
  };
  return sectionLines(section, today).length ? section : null; // 今天真的沒事，不打擾
}
