"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mt-6 space-y-3 text-center">
      <p className="font-bold">エラーが発生しました</p>
      <p className="text-sm break-words text-neutral-600">{error.message || "時間をおいてもう一度お試しください"}</p>
      <button onClick={reset} className="btn-secondary">もう一度読み込む</button>
    </div>
  );
}
