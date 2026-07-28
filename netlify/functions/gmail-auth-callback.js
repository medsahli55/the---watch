// netlify/functions/gmail-auth-callback.js
//
// Google redirects here after you approve access. This exchanges the
// authorization code for a refresh token and displays it once so you
// can copy it into Netlify's GMAIL_REFRESH_TOKEN environment variable.

exports.handler = async function (event, context) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  const code = event.queryStringParameters && event.queryStringParameters.code;

  if (!code) {
    return {
      statusCode: 400,
      body: "Missing authorization code in the request.",
    };
  }

  const redirectUri = "https://agendasahli.netlify.app/.netlify/functions/gmail-auth-callback";

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.refresh_token) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/html" },
        body: "<h2>No refresh token returned</h2><pre>" + JSON.stringify(tokenData, null, 2) + "</pre>",
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body:
        "<h2>Success — copy this refresh token</h2>" +
        "<p>Paste this into Netlify as GMAIL_REFRESH_TOKEN, then delete this text somewhere safe.</p>" +
        "<textarea style='width:100%;height:100px;font-size:14px;'>" +
        tokenData.refresh_token +
        "</textarea>",
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: "Error exchanging code for tokens: " + e.message,
    };
  }
};
