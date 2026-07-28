// netlify/functions/ask-claude.js
//
// Server-side proxy to the Anthropic API. Keeps ANTHROPIC_API_KEY out of the
// browser. Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY is not set on the server.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), { status: 400 });
  }

  const { prompt, useWebSearch, useMcp, maxTokens } = payload;
  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: { message: 'Missing prompt' } }), { status: 400 });
  }

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens || 1000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }
  if (useMcp) {
    // Requires the Gmail MCP connector's own auth to be valid for this to work;
    // this endpoint only forwards the request, it doesn't manage that token.
    body.mcp_servers = [{ type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'gmail-mcp' }];
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
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
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Upstream request failed: ' + e.message } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config = {
  path: '/.netlify/functions/ask-claude',
};
