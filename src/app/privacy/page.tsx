import { H2, LegalDoc, UL } from '@/app/ui/legal';

export const metadata = { title: '隱私權政策' };

// 隱私權政策（依台灣個人資料保護法第 8 條告知事項架構）。
// ponytail: 內容為草稿，正式收費前請律師審閱；資料庫區域請對照 Supabase 專案設定填寫。
const CONTACT = '0rigin.d.1865@gmail.com';

export default function PrivacyPage() {
  return (
    <LegalDoc title="隱私權政策" updated="2026-09-25">
      <section className="space-y-2">
        <p>
          GroupScribe（以下簡稱「本服務」）是一個加入 LINE 群組後，將群組對話整理成行程、待辦與公告的工作助理。
          本政策說明我們蒐集哪些資料、為什麼蒐集、怎麼使用與保護，以及你有哪些權利。使用本服務即表示你已閱讀並同意本政策。
        </p>
      </section>

      <section className="space-y-2">
        <H2>一、我們蒐集的資料</H2>
        <UL
          items={[
            <>
              <strong>LINE 身分資料</strong>：LINE 使用者識別碼（userId）、顯示名稱與頭像。用於登入、辨識群組成員與組織管理員。
            </>,
            <>
              <strong>群組資料</strong>：群組識別碼、群組名稱與圖片。
            </>,
            <>
              <strong>群組內容</strong>：bot 在群組期間收到的文字訊息、圖片、PDF 與語音訊息，以及由這些內容整理出的行程、待辦、公告與檔案摘要。
              貼圖、「好」「收到」等短訊息只保留原始紀錄，不做 AI 分析。
            </>,
            <>
              <strong>考勤資料</strong>（僅啟用考勤模組的組織）：打卡時間、GPS 座標、補卡申請、薪資設定與結算結果。
            </>,
            <>
              <strong>使用紀錄</strong>：AI 呼叫次數、推播次數等用量統計，用於方案額度與費用計算。
            </>,
          ]}
        />
      </section>

      <section className="space-y-2">
        <H2>二、蒐集目的與法律依據</H2>
        <p>
          我們僅為提供本服務而處理上述資料：從群組對話中整理工作資訊、讓組織管理員與群組成員查看與修正、依訂閱寄送每日提醒、計算方案用量。
          法律依據為與組織之間的服務契約，以及群組成員在 bot 加入群組時收到的告知。
        </p>
      </section>

      <section className="space-y-2">
        <H2>三、誰能看到這些資料</H2>
        <UL
          items={[
            <>
              <strong>認領該群組的組織管理員</strong>：可查看該群整理結果與原始訊息、匯出與刪除該群資料。
            </>,
            <>
              <strong>該群組的成員</strong>：可在 LINE 內查看本群的行程、待辦、公告與檔案；退出群組後即失去存取權。
            </>,
            <>
              <strong>我們的委外處理者</strong>：資料庫與檔案儲存由 Supabase 提供；AI 整理由 Google Gemini API 處理（僅傳送整理所需的內容，不用於訓練公開模型）；訊息傳遞由 LINE 提供。
            </>,
            <>我們不會將資料出售或提供給上述以外的第三方，除非法律要求。</>,
          ]}
        />
      </section>

      <section className="space-y-2">
        <H2>四、保存期間與刪除</H2>
        <UL
          items={[
            <>bot 尚未被任何組織認領的群組：不保存任何訊息；7 天內無人認領即自動退出群組。</>,
            <>認領後：資料保存至組織管理員刪除該群資料、或組織終止使用為止。</>,
            <>在 LINE 收回的訊息，我們會同步刪除對應的訊息、向量索引與媒體原檔。</>,
            <>將 bot 移出群組即停止蒐集；已保存的資料可由管理員一鍵刪除整群。</>,
            <>組織終止使用後，資料最多保留 60 天供匯出，之後刪除。</>,
          ]}
        />
      </section>

      <section className="space-y-2">
        <H2>五、你的權利</H2>
        <p>
          依個人資料保護法，你可以查詢、閱覽、請求複本、補充或更正、請求停止處理或刪除你的個人資料。
          群組成員請先向該群的組織管理員提出；也可以直接來信 {CONTACT}，我們會在 15 個工作天內回覆。
        </p>
      </section>

      <section className="space-y-2">
        <H2>六、資料安全</H2>
        <UL
          items={[
            <>傳輸全程加密（HTTPS）；媒體檔案存放於私有儲存空間，僅以短效簽名連結存取。</>,
            <>存取權以 LINE 群組成員資格為準，每次請求重新驗證。</>,
            <>資料庫每日備份。發生資料外洩時，我們會依法通知受影響的組織與個人。</>,
          ]}
        />
      </section>

      <section className="space-y-2">
        <H2>七、Cookie 與跨境傳輸</H2>
        <p>
          本服務只使用登入所需的 Cookie，不做廣告追蹤。資料儲存於 Supabase 的雲端資料中心，AI 處理由 Google 於其資料中心進行，
          因此資料可能傳輸至台灣以外地區；我們僅選擇提供相當保護水準的服務商。
        </p>
      </section>

      <section className="space-y-2">
        <H2>八、其他</H2>
        <UL
          items={[
            <>本服務不以未滿 13 歲者為對象。</>,
            <>本政策更新時會在本頁公告並更新日期；重大變更會另行通知組織管理員。</>,
            <>聯絡方式：{CONTACT}</>,
          ]}
        />
      </section>
    </LegalDoc>
  );
}
