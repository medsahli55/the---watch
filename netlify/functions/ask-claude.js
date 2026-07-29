

// netlify/functions/ask-claude.js
//
// Server-side proxy to the Anthropic API. Keeps ANTHROPIC_API_KEY out of the
// browser. Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
//
// For Gmail requests (useMcp: true), this exchanges GMAIL_REFRESH_TOKEN for a
// short-lived access token, calls the Gmail REST API directly to pull recent
// messages, and feeds their content to Claude for summarizing. (We dropped the
// MCP route — there is no public Google-hosted Gmail MCP server at the URL
// previously used, which is why every "Read Inbox" call failed.)
 
exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: { message: 'Method not allowed' } }),
    };
  }
 
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY is not set on the server.' } }),
    };
  }
 
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } }),
    };
  }
 
  const { prompt, useWebSearch, useMcp, maxTokens } = payload;
  if (!prompt || typeof prompt !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: { message: 'Missing prompt' } }),
    };
  }
 
  let finalPrompt = prompt;
 
  // ---- Gmail: fetch recent messages via REST API, fold into the prompt ----
  if (useMcp) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
 
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Gmail OAuth environment variables are not fully set.' } }),
      };
    }
 
    // 1. Refresh the access token
    let accessToken;
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: GMAIL_REFRESH_TOKEN,
          grant_type: 'refresh_token',
        }),
      });
      const tokenData = await tokenResponse.json();
 
      if (!tokenData.access_token) {
        console.error('Gmail token refresh failed:', tokenData);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { message: 'Failed to refresh Gmail access token.', details: tokenData } }),
        };
      }
      accessToken = tokenData.access_token;
    } catch (e) {
      console.error('Gmail token refresh threw:', e);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Failed to refresh Gmail token: ' + e.message } }),
      };
    }
 
    // 2. List recent messages (inbox, unread first is nicer, but keep it simple: recent 10)
    let messageIds = [];
    try {
      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();
 
      if (!listRes.ok) {
        console.error('Gmail list messages failed:', listData);
        return {
          statusCode: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { message: 'Gmail API error while listing messages.', details: listData } }),
        };
      }
      messageIds = (listData.messages || []).map((m) => m.id);
    } catch (e) {
      console.error('Gmail list messages threw:', e);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Failed to list Gmail messages: ' + e.message } }),
      };
    }
 
    if (messageIds.length === 0) {
      finalPrompt = prompt + '\n\n(The inbox has no messages to summarize.)';
    } else {
      // 3. Fetch metadata (subject, from, snippet) for each message
      const summaries = [];
      for (const id of messageIds) {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const msgData = await msgRes.json();
          if (!msgRes.ok) {
            console.error('Gmail get message failed:', id, msgData);
            continue; // skip this one, don't fail the whole request
          }
          const headers = msgData.payload?.headers || [];
          const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
          const from = headers.find((h) => h.name === 'From')?.value || '(unknown sender)';
          const snippet = msgData.snippet || '';
          summaries.push(`From: ${from}\nSubject: ${subject}\nSnippet: ${snippet}`);
        } catch (e) {
          console.error('Gmail get message threw:', id, e);
          // skip and continue
        }
      }
 
      finalPrompt =
        prompt +
        '\n\nHere are the ' +
        summaries.length +
        ' most recent inbox messages:\n\n' +
        summaries.join('\n\n---\n\n');
    }
  }
 
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens || 1000,
    messages: [{ role: 'user', content: finalPrompt }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }
 
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
 
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
 
    const data = await anthropicRes.json();
 
    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', data);
    }
 
    return {
      statusCode: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error('Upstream request to Anthropic failed:', e);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Upstream request failed: ' + e.message } }),
    };
  }
};
 
