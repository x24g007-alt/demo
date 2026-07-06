// main.js または HTML内のscriptタグなど
async function fetchUsers() {
  try {
    // 同じPages内で動くため、URLのドメイン（https://〜）は省略して「/api/users」だけで届きます
    const response = await fetch('/api/users');
    const data = await response.json();
    
    console.log("D1から取得したユーザー一覧:", data);
    // ここで画面（HTML）に反映させる処理を書く
  } catch (error) {
    console.error("データの取得に失敗しました", error);
  }
}

fetchUsers();