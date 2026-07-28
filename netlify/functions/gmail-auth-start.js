// netlify/functions/gmail-auth-start.js
//
// Visit this URL once in your browser to begin Gmail authorization.
// It redirects you to Google's login/consent screen.

exports.handler = async function (event, context) {
  const { GOOGLE_CLIENT_ID } = process.env;

  if (!GOOGLE_CLIENT_ID) {
    return {
      statusCode: 500,
      body: "GOOGLE_CLIENT_ID is not set on the server.",
    };
  }

  const redirectUri = "https://agendasahli.netlify.app/.netlify/functions/gmail-auth-callback";
  const scope = "https://www.googleapis.com/auth/gmail.readonly";

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + encodeURIComponent(GOOGLE_CLIENT_ID) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=" + encodeURIComponent(scope) +
    "&access_type=offline" +
    "&prompt=consent";

  return {
    statusCode: 302,
    headers: { Location: authUrl },
    body: "",
  };
};
