import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { loadMetrics, pct, type SalonMetric } from "@/lib/admin-metrics";
import { formatDate, jstDate } from "@/lib/date";
import { yen } from "@/lib/text";

const STATUS: Record<string, string> = {
  trialing: "体験中",
  active: "有料",
  past_due: "支払い遅れ",
  canceled: "解約",
  unpaid: "未払い",
  incomplete: "未完了",
  incomplete_expired: "期限切れ",
  paused: "停止",
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">集計中…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  // レイアウトと並行して描画されるため、ページ側でも必ず管理者か確認する
  await requireAdmin();
  const m = await loadMetrics();
  const risky = m.salons.filter((s) => s.risks.length > 0);

  return (
    <div className="space-y-8 pt-4">
      <p className="text-xs text-neutral-500">
        {formatDate(m.today)} 時点。お客さまの個人情報は表示していません（件数と利用状況のみ）。MRRは割引を含まない概算です。
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="MRR" value={yen(m.mrr)} sub="有料店舗の月額換算" />
        <Kpi label="有料店舗" value={`${m.paidCount}店`} />
        <Kpi label="体験中" value={`${m.trialCount}店`} />
        <Kpi label="体験→有料" value={pct(m.conversion.converted, m.conversion.ended)} sub={`${m.conversion.converted} / ${m.conversion.ended}店（体験終了分）`} />
        <Kpi label="今月の解約率" value={pct(m.churn.canceled, m.churn.base)} sub={`${m.churn.canceled}店 解約`} />
        <Kpi label="初期設定の完了率" value={pct(m.setupRate.done, m.setupRate.total)} sub={`${m.setupRate.done} / ${m.setupRate.total}店`} />
        <Kpi label="直近7日に使った店舗" value={pct(m.active7.active, m.active7.total)} sub={`${m.active7.active} / ${m.active7.total}店`} />
      </section>

      <section>
        <h2 className="mb-2 font-bold">解約リスクの店舗（{risky.length}）</h2>
        {risky.length === 0 ? (
          <p className="text-sm text-neutral-500">ありません</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {risky.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-neutral-500">{STATUS[s.status] ?? s.status}</span>
                {s.risks.map((r) => (
                  <span key={r} className="chip bg-red-100 text-red-700">{r}</span>
                ))}
                <span className="ml-auto text-xs text-neutral-500">最終利用：{s.lastActiveDay ? formatDate(s.lastActiveDay, m.today) : "なし"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">店舗ごとの状況（今月）</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">店舗</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">申込</th>
                <th className="px-3 py-2">初期設定</th>
                <th className="px-3 py-2 text-right">案内からの予約</th>
                <th className="px-3 py-2 text-right">LINE送信</th>
                <th className="px-3 py-2">最終利用</th>
                <th className="px-3 py-2">経路</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {m.salons.map((s) => (
                <SalonRow key={s.id} s={s} today={m.today} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">申込経路</h2>
        <table className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2">経路</th>
              <th className="px-3 py-2 text-right">体験</th>
              <th className="px-3 py-2 text-right">有料</th>
              <th className="px-3 py-2 text-right">転換率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {m.sources.map((g) => (
              <tr key={g.source}>
                <td className="px-3 py-2">{g.source}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.trials}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.paid}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(g.paid, g.trials)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SalonRow({ s, today }: { s: SalonMetric; today: string }) {
  const check = (ok: boolean, label: string) => (
    <span className={ok ? "text-green-700" : "text-neutral-300"}>{ok ? "✓" : "・"}{label} </span>
  );
  return (
    <tr>
      <td className="px-3 py-2 font-semibold">{s.name}</td>
      <td className="px-3 py-2">{STATUS[s.status] ?? s.status}{s.plan === "yearly" ? "（年）" : ""}</td>
      <td className="px-3 py-2 text-xs">{formatDate(jstDate(s.createdAt), today)}</td>
      <td className="px-3 py-2 text-xs">
        {check(s.setupSteps.line, "LINE")}
        {check(s.setupSteps.webhook, "応答設定")}
        {check(s.setupSteps.slots, "枠")}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{s.reminderBookingsThisMonth}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${s.pushThisMonth >= 190 ? "font-bold text-red-600" : ""}`}>{s.pushThisMonth} / 200</td>
      <td className="px-3 py-2 text-xs">{s.lastActiveDay ? formatDate(s.lastActiveDay, today) : "—"}</td>
      <td className="px-3 py-2 text-xs">{s.source}</td>
    </tr>
  );
}
