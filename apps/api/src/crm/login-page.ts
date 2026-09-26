/**
 * The sign-in page, as one string.
 *
 * It is server-rendered rather than a route in the React app: the records are what the gate guards,
 * the gate lives in this process, and the form that opens it lives beside it. No build step touches
 * this file, so it also still renders when the client build is broken. Its favicon is the web app's
 * `public/favicon.svg`, served by Vite or nginx outside the gate.
 */

const STYLE = `
  :root { color-scheme: light dark }
  * { box-sizing: border-box }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f4f3f1; color: #1c1b1a; padding: 24px;
    font: 400 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  main { width: 100%; max-width: 340px }
  .card {
    background: #fff; border-radius: 16px; padding: 28px 24px;
    box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
  }
  h1 { margin: 0 0 4px; font-size: 15px; font-weight: 600; letter-spacing: -.01em }
  p { margin: 0 0 20px; font-size: 13px; color: #6f6b66 }
  label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: #4a4643 }
  input {
    width: 100%; height: 40px; padding: 0 14px; border: 0; border-radius: 10px;
    background: #f4f3f1; font: inherit; color: inherit; outline: 2px solid transparent;
  }
  input:focus { outline-color: #1c1b1a }
  button {
    width: 100%; height: 40px; margin-top: 14px; border: 0; border-radius: 999px;
    background: #1c1b1a; color: #fff; font: 500 13px/1 inherit; cursor: pointer;
  }
  button:hover { background: #35322f }
  .error { margin: 0 0 14px; font-size: 12.5px; color: #a8331f }
  @media (prefers-color-scheme: dark) {
    body { background: #171615; color: #f2f0ee }
    .card { background: #211f1e; box-shadow: none }
    p { color: #9a938c } label { color: #c8c2bb }
    input { background: #2c2a28 } input:focus { outline-color: #8f8880 }
    button { background: #f2f0ee; color: #171615 } button:hover { background: #d8d4cf }
    .error { color: #e79080 }
  }
`

/** HTML-escaped, because `next` comes off the query string and lands in an attribute. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    if (character === "&") return "&amp;"
    if (character === "<") return "&lt;"
    if (character === ">") return "&gt;"
    if (character === '"') return "&quot;"
    return "&#39;"
  })
}

export function loginPage(options: { next: string; error?: string }): string {
  const error = options.error ? `<p class="error">${escapeHtml(options.error)}</p>` : ""

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Sign in · CRM</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>${STYLE}</style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>CRM</h1>
        <p>This workspace holds customer records. Sign in to continue.</p>
        ${error}
        <form method="post" action="/login">
          <input type="hidden" name="next" value="${escapeHtml(options.next)}" />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  </body>
</html>`
}
