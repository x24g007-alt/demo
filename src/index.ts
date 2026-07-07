import { Hono } from 'hono'

interface D1Result {
  meta: {
    last_row_id: number | string | null
  }
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<D1Result>
}

interface D1Database {
  exec(query: string): Promise<unknown>
  prepare(query: string): D1PreparedStatement
}

type Bindings = {
  MY_DB: D1Database
}

type User = {
  id: number
  name: string
  email: string
}

const app = new Hono<{ Bindings: Bindings }>()
const SESSION_COOKIE = 'ito_session'

let schemaReady: Promise<void> | null = null

app.get('/', async (c) => {
  await ensureSchema(c.env.MY_DB)
  const user = await getCurrentUser(c.env.MY_DB, getCookie(c.req.header('Cookie'), SESSION_COOKIE))

  return c.html(page('Home', user ? `Signed in as ${escapeHtml(user.name)}` : 'Login / Sign up', `
    <p>${user ? `Email: ${escapeHtml(user.email)}` : 'Use D1 to create an account and log in.'}</p>
    ${user ? '<form method="post" action="/logout"><button type="submit">Logout</button></form>' : '<p><a href="/signup">Sign up</a> | <a href="/login">Login</a></p>'}
  `))
})

app.get('/signup', async (c) => {
  await ensureSchema(c.env.MY_DB)
  return c.html(authPage('Sign up', '/signup', 'Create account', true))
})

app.post('/signup', async (c) => {
  await ensureSchema(c.env.MY_DB)
  const form = await c.req.formData()
  const name = text(form.get('name'))
  const email = text(form.get('email')).toLowerCase()
  const password = text(form.get('password'))

  if (!name || !email || !password) return c.html(authPage('Sign up', '/signup', 'Create account', true, { name, email, error: 'Missing fields' }), 400)
  if (password.length < 6) return c.html(authPage('Sign up', '/signup', 'Create account', true, { name, email, error: 'Password must be 6+ chars' }), 400)
  if (!isEmail(email)) return c.html(authPage('Sign up', '/signup', 'Create account', true, { name, email, error: 'Invalid email' }), 400)

  const exists = await c.env.MY_DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exists) return c.html(authPage('Sign up', '/signup', 'Create account', true, { name, email, error: 'Email already exists' }), 400)

  const passwordHash = await hashPassword(password)
  const result = await c.env.MY_DB
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .bind(name, email, passwordHash)
    .run()

  const userId = Number(result.meta.last_row_id)
  const session = await createSession(c.env.MY_DB, userId)
  return redirectWithCookie('/', session.token, session.expiresAt)
})

app.get('/login', async (c) => {
  await ensureSchema(c.env.MY_DB)
  return c.html(authPage('Login', '/login', 'Login', false))
})

app.post('/login', async (c) => {
  await ensureSchema(c.env.MY_DB)
  const form = await c.req.formData()
  const email = text(form.get('email')).toLowerCase()
  const password = text(form.get('password'))

  const user = await c.env.MY_DB
    .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<User & { password_hash: string }>()

  if (!user) return c.html(authPage('Login', '/login', 'Login', false, { email, error: 'Invalid email or password' }), 400)
  if (!(await verifyPassword(password, user.password_hash))) {
    return c.html(authPage('Login', '/login', 'Login', false, { email, error: 'Invalid email or password' }), 400)
  }

  const session = await createSession(c.env.MY_DB, user.id)
  return redirectWithCookie('/', session.token, session.expiresAt)
})

app.post('/logout', async (c) => {
  await ensureSchema(c.env.MY_DB)
  const token = getCookie(c.req.header('Cookie'), SESSION_COOKIE)
  if (token) {
    await c.env.MY_DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': `${SESSION_COOKIE}=; Expires=${new Date(0).toUTCString()}; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    },
  })
})

export default app

async function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = Promise.all([
      db
        .prepare(
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`,
        )
        .run(),
      db
        .prepare(
          `CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`,
        )
        .run(),
    ]).then(() => undefined)
  }
  await schemaReady
}

async function getCurrentUser(db: D1Database, token: string | undefined) {
  if (!token) return null

  const session = await db
    .prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<{ token: string; user_id: number; expires_at: string }>()

  if (!session) return null
  if (Date.parse(session.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return null
  }

  return db.prepare('SELECT id, name, email FROM users WHERE id = ?').bind(session.user_id).first<User>()
}

async function createSession(db: D1Database, userId: number) {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run()

  return { token, expiresAt }
}

function redirectWithCookie(path: string, token: string, expiresAt: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Expires=${new Date(expiresAt).toUTCString()}; Path=/; HttpOnly; SameSite=Lax`,
    },
  })
}

function page(title: string, heading: string, body: string) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.5; }
        header, main, form { margin-bottom: 16px; }
        input, button { font: inherit; padding: 10px 12px; }
        form { display: grid; gap: 12px; max-width: 360px; }
        .error { color: #b00020; }
      </style>
    </head>
    <body>
      <header><a href="/">Home</a></header>
      <main>
        <h1>${escapeHtml(heading)}</h1>
        ${body}
      </main>
    </body>
  </html>`
}

function authPage(
  title: string,
  action: string,
  heading: string,
  signup: boolean,
  values?: { name?: string; email?: string; error?: string },
) {
  const nameField = signup
    ? `<label>Name <input name="name" value="${escapeAttr(values?.name ?? '')}" required></label>`
    : ''
  return page(
    title,
    heading,
    `
      ${values?.error ? `<p class="error">${escapeHtml(values.error)}</p>` : ''}
      <form method="post" action="${escapeAttr(action)}">
        ${nameField}
        <label>Email <input type="email" name="email" value="${escapeAttr(values?.email ?? '')}" required></label>
        <label>Password <input type="password" name="password" minlength="6" required></label>
        <button type="submit">${escapeHtml(title)}</button>
      </form>
    `,
  )
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function hashPassword(password: string) {
  return hashPasswordWithSalt(password, crypto.randomUUID())
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt] = stored.split(':')
  if (scheme !== 'sha256' || !salt) return false
  return (await hashPasswordWithSalt(password, salt)) === stored
}

async function hashPasswordWithSalt(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${salt}:${toHex(new Uint8Array(digest))}`
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll('`', '&#96;')
}
