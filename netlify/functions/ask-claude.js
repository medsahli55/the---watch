// netlify/functions/ask-claude.js
//
// Server-side proxy to the Anthropic API. Keeps ANTHROPIC_API_KEY out of the
// browser. Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
//
// For Gmail MCP requests, this exchanges GMAIL_REFRESH_TOKEN for a short-lived
// access token and attaches it to the mcp_servers entry so Anthropic's Gmail
// connector can authenticate on your behalf.

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

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens || 1000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  if (useMcp) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Gmail OAuth environment variables are not fully set.' } }),
      };
    }

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
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { message: 'Failed to refresh Gmail access token.', details: tokenData } }),
        };
      }

      body.mcp_servers = [{
        type: 'url',
        url: 'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail-mcp',
        authorization_token: tokenData.access_token,
      }];
    } catch (e) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Failed to refresh Gmail token: ' + e.message } }),
      };
    }
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (useMcp) {
      headers['anthropic-beta'] = 'mcp-client-2025-04-04';
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();

    return {
      statusCode: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Upstream request failed: ' + e.message } }),
    };
  }
};
