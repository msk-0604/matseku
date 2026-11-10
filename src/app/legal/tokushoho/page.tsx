import type { Metadata } from "next";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

const ROWS: [string, string][] = [
  ["販売事業者", "【要記入：氏名または屋号／法人名】"],
  ["運営責任者", "【要記入】"],
  ["所在地", "【要記入】（個人事業の場合、「請求があった場合には遅滞なく開示します」とすることもできます）"],
  ["電話番号", "【要記入】（同上。受付時間：平日10:00〜18:00）"],
  ["メールアドレス", "【要記入】"],
  ["販売価格", "月額プラン 7,480円（税込）／年額プラン 74,800円（税込）"],
  ["商品代金以外の必要料金", "インターネット接続料金・通信料金はお客さまのご負担となります。LINE公式アカウントの有料プランをご利用の場合、その料金はLINEヤフー株式会社に別途お支払いいただきます。"],
  ["お支払い方法", "クレジットカード（Stripe社の決済サービスを利用）"],
  ["お支払い時期", "14日間の無料体験終了日に初回のお支払いが発生し、以後は月額プランは毎月、年額プランは毎年、同じ日に自動で更新・請求されます。"],
  ["サービスの提供時期", "お申し込み手続きの完了後、すぐにご利用いただけます。"],
  ["解約・返金", "いつでも管理画面（設定 → プラン・お支払い）から解約できます。解約は現在の請求期間の終了時に適用され、期間途中の解約による日割りの返金はいたしません。無料体験期間中に解約した場合、料金は発生しません。"],
  ["動作環境", "最新版の Safari（iOS）、Google Chrome（Android／PC）。お客さま用ページは LINE アプリ内で動作します。"],
];

export default function TokushohoPage() {
  return (
    <>
      <h1>特定商取引法に基づく表記</h1>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {ROWS.map(([k, v]) => (
            <tr key={k} className="border-b border-neutral-200 align-top">
              <th className="w-36 py-3 pr-3 text-left font-semibold">{k}</th>
              <td className="py-3">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
