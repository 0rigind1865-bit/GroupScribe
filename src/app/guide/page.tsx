import { BrandBar, LegalFooter } from '@/app/ui/intro';
import { AskMock, Phone, Shot } from '@/app/ui/intro-mocks';

export const metadata = { title: '新手教學', description: '5 分鐘開始用群記：建立組織、邀進群、認領、把關。' };

// 新手教學（圖文）：官網、/start、上手卡都連過來。圖一律用 intro-mocks 的假介面與 public/shots 的示範截圖，
// 不放真實群組畫面。介面改版後重拍 public/shots，見 docs/screenshots/README.md。文案要跟真的流程對得上：/start、claimNotice（core/ingest.ts）、認領頁、把關頁。

const Bubble = ({ who, me, children }: { who?: string; me?: boolean; children: React.ReactNode }) =>
  me ? (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-emerald-100 px-2 py-1.5 text-emerald-900">{children}</p>
    </div>
  ) : (
    <div>
      {who && <p className="mb-0.5 px-1 text-[11px] text-gray-500">{who}</p>}
      <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-2 py-1.5 shadow-xs">{children}</p>
    </div>
  );

function StartMock() {
  return (
    <Phone title="建立組織">
      <div className="space-y-2 rounded-lg bg-white p-2.5">
        <p className="text-[12px] text-gray-500">組織名稱（公司或團隊的名字）</p>
        <div className="rounded-md border border-emerald-600 px-2 py-1.5">宏達工程</div>
        <div className="rounded-md bg-emerald-600 py-1.5 text-center font-semibold text-white">建立（免費方案，1 個群）</div>
      </div>
    </Phone>
  );
}

function InviteMock() {
  return (
    <Phone title="邀請好友">
      {[
        { n: '群記', d: '官方帳號', on: true },
        { n: '阿凱', d: '', on: false },
        { n: '雅婷', d: '', on: false },
      ].map((x) => (
        <div key={x.n} className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 ${x.on ? 'border-emerald-600' : 'border-gray-200'}`}>
          {x.n === '群記' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/mark-512.png" alt="" className="h-7 w-7 rounded-full" />
          ) : (
            <span className="h-7 w-7 rounded-full bg-gray-200" />
          )}
          <span className="flex-1">
            <span className="block font-semibold">{x.n}</span>
            {x.d && <span className="block text-[11px] text-gray-500">{x.d}</span>}
          </span>
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] text-white ${x.on ? 'bg-emerald-600' : 'border border-gray-300'}`}>
            {x.on ? '✓' : ''}
          </span>
        </div>
      ))}
      <div className="rounded-md bg-emerald-600 py-1.5 text-center font-semibold text-white">邀請</div>
    </Phone>
  );
}

function ClaimMsgMock() {
  return (
    <Phone title="工作群">
      <div className="flex items-start gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-512.png" alt="" className="h-6 w-6 flex-none rounded-lg" />
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-2 py-1.5 shadow-xs">
          大家好，我是群記 🦉
          <br />
          這個群還沒有所屬的公司，所以我還沒開始記錄。請管理員點這裡認領（一鍵、免費）：
          <span className="mt-1.5 block rounded-lg border-2 border-amber-300 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-900">
            👉 認領這個群
          </span>
        </div>
      </div>
      <div className="rounded-lg bg-white p-2.5 text-center">
        <p className="text-[12px] text-gray-500">點開連結後</p>
        <div className="mt-1 rounded-md bg-emerald-600 py-1.5 font-semibold text-white">認領這個群</div>
      </div>
    </Phone>
  );
}

function ChatMock() {
  return (
    <Phone title="工作群">
      <Bubble who="老闆">@阿凱 週三前把估價單寄給客戶</Bubble>
      <Bubble who="雅婷">下週一早上 9 點在公司開會</Bubble>
      <Bubble me>收到 👍</Bubble>
      <p className="px-1 text-center text-[11px] text-gray-500">群記不會插話，它在背景整理 ↓</p>
      <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-900">
        <p>📋 待辦：寄估價單給客戶 · 阿凱 · 週三</p>
        <p>📅 行程：開會 · 下週一 09:00</p>
      </div>
    </Phone>
  );
}

const STEPS: { id: string; t: string; d: React.ReactNode; tip?: React.ReactNode; img: React.ReactNode }[] = [
  {
    id: 'start',
    t: '用 LINE 登入，建立組織',
    d: (
      <>
        打開 <a className="text-emerald-700 underline" href="/start">免費開始</a>，用 LINE 登入，填公司或團隊的名字，按「建立」。你就是這個組織的管理員。
      </>
    ),
    tip: '免費方案：1 個群、成員人數不限、不用綁卡。',
    img: <StartMock />,
  },
  {
    id: 'invite',
    t: '把群記邀進 LINE 工作群',
    d: '打開你的 LINE 工作群 → 右上角選單 →「邀請」→ 勾選「群記」→ 按「邀請」。跟邀朋友進群一樣。',
    tip: (
      <>
        找不到群記？先加它好友。LINE 規定<strong>一個群只能有一個官方帳號</strong>，群裡已有其他機器人（打卡、客服等）要先移出。群記名字旁是灰色盾牌，這是正常的。
      </>
    ),
    img: <InviteMock />,
  },
  {
    id: 'claim',
    t: '點群裡的認領連結',
    d: '群記進群後會貼一則訊息和認領連結。管理員點連結、按「認領這個群」，這個群就歸到你的公司。',
    tip: '認領前群記不記錄任何內容。7 天內沒人認領，它會自己離開。',
    img: <ClaimMsgMock />,
  },
  {
    id: 'talk',
    t: '照常在群裡講話',
    d: '不用學新東西。大家照平常講話、傳照片、傳 PDF。群記安靜地把「誰、做什麼、哪天」整理成待辦、行程和公告。',
    tip: '已經聊了很久？可以到後台「匯入」，把 LINE 匯出的聊天記錄 txt 丟進來，近 30 天的內容會直接整理。',
    img: <ChatMock />,
  },
  {
    id: 'review',
    t: '到「把關」點頭確認',
    d: '群記整理的東西會先排在「今天」最上面和「把關」頁。每張卡片上面是原話、下面是整理結果：對就按確認，錯就修改，不是就忽略。',
    tip: '你確認過的才算數。忽略過的，它會記住，不會再犯。',
    img: <Shot src="/shots/site-inbox.webp" alt="把關頁：每張卡附上原話與確認按鈕" />,
  },
  {
    id: 'today',
    t: '每天打開「今天」',
    d: '打開就知道今天要做什麼：所有群的行程和到期待辦排在同一條時間線，逾期的標紅。',
    img: <Shot src="/shots/site-today.webp" alt="今天頁：待確認提醒與日期時間線" />,
  },
  {
    id: 'ask',
    t: '忘了就 @群記 問',
    d: '在群裡打「@群記 上次那份估價單多少錢？」，它會回答，還會說是誰、哪天講的。查不到就直說查不到。',
    tip: '平常它不會在群裡說話，只有被 @ 才回答。',
    img: <AskMock />,
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-md pb-12 md:max-w-3xl">
      <BrandBar right={<a className="btn btn-sm" href="/start">免費開始</a>} />

      <section className="px-5 pt-4 pb-6">
        <p className="text-xs font-semibold tracking-widest text-emerald-700">新手教學</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">5 分鐘開始用群記</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          管理員照下面 7 步做就好。群組成員什麼都不用裝、不用註冊，跳到{' '}
          <a className="text-emerald-700 underline" href="#member">成員怎麼看</a>。
        </p>
        <nav className="mt-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-gray-100">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-emerald-600 text-xs font-semibold text-emerald-700">
                {i + 1}
              </span>
              {s.t}
            </a>
          ))}
        </nav>
      </section>

      <ol className="space-y-14 px-4">
        {STEPS.map((s, i) => (
          <li key={s.id} id={s.id} className="flex scroll-mt-4 flex-col gap-4 md:flex-row md:items-center md:gap-8">
            <div className="md:flex-1">
              <p className="flex items-center gap-2">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">{i + 1}</span>
                <span className="text-lg font-semibold tracking-tight">{s.t}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{s.d}</p>
              {s.tip && <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-600">💡 {s.tip}</p>}
            </div>
            <div className="md:flex-1">{s.img}</div>
          </li>
        ))}
      </ol>

      <section id="member" className="mt-16 flex scroll-mt-4 flex-col gap-4 px-4 md:flex-row md:items-center md:gap-8">
        <div className="md:flex-1">
          <p className="text-xs font-semibold tracking-widest text-emerald-700">群組成員</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">成員怎麼看</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
            <li>點群記在群裡貼的「看整理」連結（管理員也可以從後台右上角的工具選單，點「給成員的連結」貼到群裡）。</li>
            <li>在 LINE 裡直接打開，看得到自己群的行程、待辦、公告和檔案，「我的待辦」在最上面。</li>
            <li>想每天早上收到提醒：點群記頭像「加入好友」，再從連結裡打開提醒。只有自己收得到。</li>
          </ol>
          <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-600">💡 成員只看得到自己所在的群，退群就看不到了。</p>
        </div>
        <div className="md:flex-1">
          <Shot src="/shots/site-member.webp" alt="成員在 LINE 裡看到的畫面：待確認提醒與我的待辦" />
        </div>
      </section>

      <section className="mx-4 mt-16 rounded-2xl bg-emerald-50 p-5 text-center">
        <p className="font-semibold text-emerald-900">準備好了嗎？</p>
        <a className="btn-primary mt-3 h-11 w-full text-base" href="/start">
          免費開始
        </a>
        <a className="mt-3 block text-sm text-emerald-800 underline" href="/about#demo">
          先看看怎麼運作
        </a>
      </section>

      <LegalFooter />
    </div>
  );
}
