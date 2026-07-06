async function fetchUsers() {
  try {
    // サーバー側のAPI（users.ts）を呼び出す
    const response = await fetch('/api/users'); // もしファイル名が user.ts なら '/api/user' にしてね
    const data = await response.json();
    
    console.log("D1から取得したユーザー一覧:", data);
    
    // HTMLの画面に表示したい場合は、ここに処理を書きます
    // 例: document.getElementById('result').innerText = JSON.stringify(data);

  } catch (error) {
    console.error("データの取得に失敗しました:", error);
  }
}

// ページが開かれたら実行する
fetchUsers();