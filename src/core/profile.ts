import { getDb } from '@/db';
import { getLLM } from './config';

// 群組理解檔案：從群組自己的紀錄歸納背景（產業/術語/成員/案子），存 groups.profile。
// 抽取與 @提及回答會把它注入 prompt——助理逐群學會該群的行話與脈絡，不預設任何產業。
// 觸發：匯入頁抽取完成後自動更新；總覽卡片可手動重新產生或直接編輯。

const SAMPLE = 300; // 對話樣本則數（最近的非低資訊訊息）
const MAX_ITEMS = 30; // 各類已整理項目上限

export async function profileGroup(groupId: string): Promise<string> {
  const db = getDb();

  const { data: msgs } = await db
    .from('messages')
    .select('sender_name, sender_id, text')
    .eq('group_id', groupId)
    .eq('type', 'text')
    .eq('is_low_info', false)
    .order('created_at', { ascending: false })
    .limit(SAMPLE);
  const msgLines = (msgs ?? []).reverse().map((m) => `${m.sender_name ?? m.sender_id ?? '?'}：${m.text}`);
  if (!msgLines.length) throw new Error('此群組還沒有可歸納的訊息');

  const [{ data: evs }, { data: tks }, { data: nts }, { data: cur, error: curErr }] = await Promise.all([
    db.from('events').select('title, starts_at').eq('group_id', groupId).neq('status', 'ignored')
      .order('starts_at', { ascending: false }).limit(MAX_ITEMS),
    db.from('tasks').select('title, assignee').eq('group_id', groupId).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(MAX_ITEMS),
    db.from('notes').select('title, kind').eq('group_id', groupId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(MAX_ITEMS),
    db.from('groups').select('profile').eq('group_id', groupId).maybeSingle(),
  ]);
  // 欄位未建（migration 004 未跑）在這裡就會浮現——趕在燒 LLM 之前失敗，不白花錢
  if (curErr) throw new Error(`讀取 groups.profile 失敗（migration 004 跑了嗎？）：${curErr.message}`);
  const itemLines = [
    ...(evs ?? []).map((e) => `事件｜${e.starts_at}｜${e.title}`),
    ...(tks ?? []).map((t) => `待辦｜${t.title}${t.assignee ? `（${t.assignee}）` : ''}`),
    ...(nts ?? []).map((n) => `${n.kind === 'decision' ? '決議' : '公告'}｜${n.title}`),
  ];

  const prompt = `你是工作群組的背景分析助理。根據下方「這個群組自己的」對話樣本與已整理項目，歸納此群組的工作背景，供後續 AI 更準確理解此群訊息並給出貼合其產業的建議。不要套用任何預設產業，一切以紀錄為準。

輸出繁體中文 markdown 條列，只寫紀錄裡有依據的內容，不確定就省略，禁止編造：
- **產業與業務**：這群人做什麼行業、什麼類型的工作
- **常用術語**：此群特有的行話、縮寫、代號與其意思
- **成員與角色**：常出現的人名與大致分工
- **進行中的案子**：討論中的專案/案件與目前狀態
- **觀察與建議**：從近期對話看到的模式與值得管理者留意的方向（例如反覆延期的事、資訊只在一個人身上、常見的溝通斷層），1～3 點；每點必須指出依據，沒有明確依據就整段省略

【已整理項目】
${itemLines.length ? itemLines.join('\n') : '無'}

【對話樣本】（最近 ${msgLines.length} 則）
${msgLines.join('\n')}
${cur?.profile ? `\n【先前歸納】（供更新參考，以新資訊為準）\n${cur.profile}` : ''}

全文 500 字內，直接輸出內容，不要開場白。`;

  const profile = (await getLLM().generate(prompt)).trim();

  // 只寫 profile 欄位，不碰 name/category（與 group/update 同一套 upsert 紀律）
  const { error } = await db
    .from('groups')
    .upsert({ group_id: groupId, profile, profile_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) throw error; // groups.profile 欄位未建（migration 004）時在此浮現，API 層回報
  return profile;
}

// 讀取群組理解（抽取與回答共用）；欄位未建或無資料 → null，功能自然降級
export async function getProfile(groupId: string): Promise<string | null> {
  const { data } = await getDb().from('groups').select('profile').eq('group_id', groupId).maybeSingle();
  return data?.profile ?? null;
}
