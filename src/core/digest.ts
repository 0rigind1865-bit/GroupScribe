import { getDb } from '@/db';
import { getConnector } from './config';
import { liffUrl } from './ingest';
import { isAdminLineUser, isGroupMember } from './liff';

// 每日摘要（計劃 B.8）：1:1 私訊給「自己訂閱的人」，群組永遠零聲量。
// 只在該群今天真的有事時才推——沒事還發訊息，訂閱很快就會被關掉。
// 由 NAS cron 打 POST /api/digest 觸發；同日重複呼叫由 last_sent_on 擋掉。

export interface DigestStats {
  subscribers: number;
  sent: number;
  skippedEmpty: number; // 該群今天沒事，不打擾
  skippedSent: number; // 今天已推過
  disabled: number; // 對方封鎖/未加好友 → 自動停用
}

export async function runDailyDigest(): Promise<DigestStats> {
  const db = getDb();
  const stats: DigestStats = { subscribers: 0, sent: 0, skippedEmpty: 0, skippedSent: 0, disabled: 0 };
  const connector = getConnector();
  if (!connector.push) return stats; // 平台不支援主動推送

  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('group_id, line_user_id, last_sent_on')
    .eq('enabled', true);
  if (error) throw new Error(`讀取訂閱失敗（migration 009 跑了嗎？）：${error.message}`);
  stats.subscribers = (subs ?? []).length;

  const bodyCache = new Map<string, string | null>(); // 同群多人訂閱只組一次
  for (const s of subs ?? []) {
    if (s.last_sent_on === today) {
      stats.skippedSent++;
      continue;
    }
    // 退群的人不該再收到該群摘要（成員資格以 LINE 為權威，見 B.3）
    if (!(await isGroupMember(s.group_id, s.line_user_id))) {
      await db.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('group_id', s.group_id).eq('line_user_id', s.line_user_id);
      stats.disabled++;
      continue;
    }

    const key = `${s.group_id}|${isAdminLineUser(s.line_user_id) ? 'admin' : 'member'}`;
    if (!bodyCache.has(key)) bodyCache.set(key, await buildDigest(s.group_id, today, isAdminLineUser(s.line_user_id)));
    const body = bodyCache.get(key);
    if (!body) {
      stats.skippedEmpty++;
      continue;
    }

    const r = await connector.push(s.line_user_id, body);
    if (r === 'ok') {
      await db.from('push_subscriptions')
        .update({ last_sent_on: today, fail_count: 0, updated_at: new Date().toISOString() })
        .eq('group_id', s.group_id).eq('line_user_id', s.line_user_id);
      stats.sent++;
    } else if (r === 'blocked') {
      // 封鎖或解除好友：永久性，直接停用（使用者可在 LIFF 重新打開）
      await db.from('push_subscriptions')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('group_id', s.group_id).eq('line_user_id', s.line_user_id);
      stats.disabled++;
    } else {
      await db.from('push_subscriptions')
        .update({ fail_count: (s as any).fail_count ?? 0 + 1, updated_at: new Date().toISOString() })
        .eq('group_id', s.group_id).eq('line_user_id', s.line_user_id);
    }
  }
  return stats;
}

// 組摘要內容；今天沒有任何事就回 null（不打擾）
async function buildDigest(groupId: string, today: string, isAdmin: boolean): Promise<string | null> {
  const db = getDb();
  const [{ data: g }, { data: events }, { data: tasks }] = await Promise.all([
    db.from('groups').select('name, orgs(slug)').eq('group_id', groupId).maybeSingle(),
    db.from('events').select('title, start_time, location').eq('group_id', groupId)
      .eq('status', 'active').eq('starts_at', today).order('start_time', { nullsFirst: true }),
    db.from('tasks').select('title, assignee, due_at').eq('group_id', groupId)
      .eq('status', 'open').not('due_at', 'is', null).lte('due_at', today).order('due_at'),
  ]);

  const lines: string[] = [];
  if (events?.length) {
    lines.push('📅 今日行程');
    for (const e of events) {
      const meta = [e.start_time ? String(e.start_time).slice(0, 5) : '時間未定', e.location].filter(Boolean).join(' · ');
      lines.push(`・${e.title}（${meta}）`);
    }
  }
  if (tasks?.length) {
    if (lines.length) lines.push('');
    lines.push('✅ 到期待辦');
    for (const t of tasks) {
      const overdue = t.due_at < today ? `逾期 ${t.due_at.slice(5).replace('-', '/')}` : '今天到期';
      lines.push(`・${t.title}（${overdue}${t.assignee ? ` · ${t.assignee}` : ''}）`);
    }
  }

  if (isAdmin) {
    const [ev, tk, nt] = await Promise.all([
      db.from('events').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).neq('status', 'ignored'),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).eq('status', 'open'),
      db.from('notes').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('needs_confirmation', true).eq('status', 'active'),
    ]);
    const pending = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);
    if (pending > 0) {
      if (lines.length) lines.push('');
      // 確認要在管理收件匣做；成員版（下面的「詳細內容」）看得到卻按不了確認
      const slug = (g as { orgs?: { slug?: string } | null } | null)?.orgs?.slug;
      const inbox = slug ? liffUrl({ path: `/o/${slug}/inbox`, params: { group: groupId }, src: 'digest' }) : null;
      lines.push(`⚠️ ${pending} 筆待你確認${inbox ? `\n去確認 👉 ${inbox}` : ''}`);
    }
  }

  if (!lines.length) return null; // 今天真的沒事，不打擾

  const name = g?.name ?? groupId;
  const url = liffUrl({ g: groupId, src: 'digest' });
  return [`【${name}】今日摘要`, '', ...lines, ...(url ? ['', `詳細內容 👉 ${url}`] : [])].join('\n');
}
