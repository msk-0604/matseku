import { signOut } from "../actions";

export default function NoSalonPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-xl font-bold">サロンが登録されていません</h1>
      <p className="text-sm leading-relaxed text-neutral-700">
        このアカウントにはサロンの情報がまだありません。お申し込み後のご案内メールをご確認いただくか、運営までお問い合わせください。
      </p>
      <form action={signOut}>
        <button className="btn-secondary w-full">ログアウト</button>
      </form>
    </main>
  );
}
