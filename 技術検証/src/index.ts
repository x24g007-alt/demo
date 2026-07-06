async function fetchUsers() {
  try {
    const response = await fetch('../functions/api/users');
    const data = await response.json();
    console.log("D1から取得したユーザー一覧:", data);
  } catch (error) {
    console.error("データの取得に失敗しました:", error);
  }
}

fetchUsers();