interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // POSTリクエスト（データ送信）以外は受け付けない
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    // ブラウザから送られてきたデータ（email, password）を受け取る
    const { email, password } = await context.request.json() as any;

    // D1データベースから、そのメールアドレスのユーザーを探す
    // ※ 簡易的な判定です。本来はパスワードをハッシュ化して比較します
    const user = await context.env.DB.prepare(
      "SELECT * FROM users WHERE email = ? AND password = ?"
    ).bind(email, password).first();

    if (user) {
      // ユーザーが見つかったら成功を返す
      return new Response(JSON.stringify({ message: "Success", user }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // 見つからなければエラーを返す
      return new Response(JSON.stringify({ error: "メールアドレスまたはパスワードが違います" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};