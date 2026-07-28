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
  path: '/api/ask-claude',
};
