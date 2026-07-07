document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); // ページのリロードを防ぐ

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const messageElement = document.getElementById('message');

  messageElement.innerText = "ログイン中...";

  try {
    // 超シンプルパス！ /functions/login.ts を呼び出します
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      messageElement.innerText = "ログイン成功！おめでとうございます！";
      console.log("サーバーからの返事:", data);
    } else {
      messageElement.innerText = "エラー: " + data.error;
    }
  } catch (error) {
    messageElement.innerText = "通信エラーが発生しました。";
  }
});