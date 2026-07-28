// netlify/functions/get-google-tasks.js
//
// Fetches all open Google Tasks (across all task lists), sorted by due date.
// Requires these Netlify environment variables:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN

exports.handler = async function (event, context) {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Google OAuth environment variables." }),
      };
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to refresh access token.", details: tokenData }),
      };
    }

    const accessToken = tokenData.access_token;
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const listsResponse = await fetch(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
      { headers: authHeader }
    );
    const listsData = await listsResponse.json();
    const taskLists = listsData.items || [];

    let allTasks = [];

    for (const list of taskLists) {
      const tasksResponse = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&showHidden=false`,
        { headers: authHeader }
      );
      const tasksData = await tasksResponse.json();
      const items = (tasksData.items || []).map((task) => ({
        id: task.id,
        title: task.title,
        notes: task.notes || "",
        due: task.due || null,
        listName: list.title,
        status: task.status,
      }));
      allTasks = allTasks.concat(items);
    }

    allTasks.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: allTasks, count: allTasks.length }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Unexpected error fetching tasks.", details: err.message }),
    };
  }
};
