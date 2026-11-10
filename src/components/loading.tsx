export function PageLoading({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16 text-sm text-neutral-400" aria-busy="true">
      {label}
    </div>
  );
}
