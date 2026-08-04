// BOBR – backend. Servíruje statické soubory z ../public a poskytuje API.
// Spuštění:  node server.js   (potřebuje vyplněný .env – viz config.example.env)
const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcryptjs");
const { pool, dbConfig } = require("./db");

const app = express();
app.use(express.json({ limit: "50mb" }));

// Sezení uložená v databázi (tabulku si store vytvoří sám).
const sessionStore = new MySQLStore({
  host: dbConfig.host, port: dbConfig.port, user: dbConfig.user,
  password: dbConfig.password, database: dbConfig.database,
});
app.use(session({
  key: "bobr.sid",
  secret: process.env.SESSION_SECRET || "zmen-me-v-env",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true", // true jen za HTTPS
    maxAge: 1000 * 60 * 60 * 8,                    // 8 hodin
  },
}));

// --- pomocné ---
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "unauthorized" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin)
    return res.status(403).json({ error: "forbidden" });
  next();
}
async function roleFor(userId, appKey) {
  const [rows] = await pool.query(
    "SELECT role FROM permissions WHERE user_id=? AND app_key=?", [userId, appKey]);
  return rows.length ? rows[0].role : null;
}
async function logAct(user, action, detail) {
  try {
    await pool.query("INSERT INTO activity (user_id, email, action, detail) VALUES (?,?,?,?)",
      [user && user.id || null, user && user.email || null, action, detail || null]);
  } catch (e) { console.error("log:", e.message); }
}

// --- přihlášení ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing" });
    const [rows] = await pool.query(
      "SELECT id, email, pass_hash, is_admin, must_change_pw FROM users WHERE email=?", [email]);
    if (!rows.length) return res.status(401).json({ error: "invalid" });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.pass_hash);
    if (!ok) return res.status(401).json({ error: "invalid" });
    req.session.user = { id: u.id, email: u.email, is_admin: !!u.is_admin, must_change_pw: !!u.must_change_pw };
    await pool.query("UPDATE users SET last_login=NOW() WHERE id=?", [u.id]);
    logAct(req.session.user, "login", null);
    res.json({ email: u.email, is_admin: !!u.is_admin, must_change_pw: !!u.must_change_pw });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireLogin, async (req, res) => {
  const [perms] = await pool.query(
    "SELECT app_key, role FROM permissions WHERE user_id=?", [req.session.user.id]);
  res.json({
    email: req.session.user.email,
    is_admin: req.session.user.is_admin,
    must_change_pw: req.session.user.must_change_pw,
    permissions: perms,
  });
});

// vlastní změna hesla (i pro vynucenou změnu při prvním přihlášení)
app.post("/api/change-password", requireLogin, async (req, res) => {
  try {
    const { new_password } = req.body || {};
    if (!new_password || String(new_password).length < 4)
      return res.status(400).json({ error: "short" });
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query("UPDATE users SET pass_hash=?, must_change_pw=0 WHERE id=?",
      [hash, req.session.user.id]);
    req.session.user.must_change_pw = false;
    logAct(req.session.user, "password_change", "vlastní heslo");
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

// --- data aplikací ---
app.get("/api/data", requireLogin, async (req, res) => {
  try {
    const appKey = req.query.app;
    if (!appKey) return res.status(400).json({ error: "missing app" });
    if (!req.session.user.is_admin && !(await roleFor(req.session.user.id, appKey)))
      return res.status(403).json({ error: "forbidden" });
    const [rows] = await pool.query("SELECT data FROM app_data WHERE app_key=?", [appKey]);
    res.json({ data: rows.length ? JSON.parse(rows[0].data) : null });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/save", requireLogin, async (req, res) => {
  try {
    const { app: appKey, data } = req.body || {};
    if (!appKey) return res.status(400).json({ error: "missing app" });
    // admin smí přepsat data kterékoli aplikace (např. obnova ze zálohy); jinak nutná role 'edit'
    if (!req.session.user.is_admin && await roleFor(req.session.user.id, appKey) !== "edit")
      return res.status(403).json({ error: "forbidden" });
    const json = JSON.stringify(data ?? {});
    await pool.query(
      "INSERT INTO app_data (app_key, data, updated_by) VALUES (?,?,?) " +
      "ON DUPLICATE KEY UPDATE data=VALUES(data), updated_by=VALUES(updated_by)",
      [appKey, json, req.session.user.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

// --- správa uživatelů (jen admin) ---
app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query("SELECT id, email, is_admin, last_login FROM users ORDER BY email");
    const [perms] = await pool.query("SELECT user_id, app_key, role FROM permissions");
    const byUser = {};
    perms.forEach(p => { (byUser[p.user_id] = byUser[p.user_id] || []).push({ app_key: p.app_key, role: p.role }); });
    res.json({
      me_id: req.session.user.id,
      users: users.map(u => ({ id: u.id, email: u.email, is_admin: !!u.is_admin, last_login: u.last_login, permissions: byUser[u.id] || [] })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/users", requireAdmin, async (req, res) => {
  try {
    const { email, password, is_admin } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing" });
    const hash = await bcrypt.hash(password, 12);
    try {
      await pool.query("INSERT INTO users (email, pass_hash, is_admin) VALUES (?,?,?)", [email, hash, is_admin ? 1 : 0]);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "exists" });
      throw e;
    }
    logAct(req.session.user, "user_create", email + (is_admin ? " (admin)" : ""));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/users/:id/password", requireAdmin, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "missing" });
    const hash = await bcrypt.hash(password, 12);
    await pool.query("UPDATE users SET pass_hash=? WHERE id=?", [hash, req.params.id]);
    logAct(req.session.user, "password_reset", "uživatel #" + req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/users/:id/admin", requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.session.user.id)
      return res.status(400).json({ error: "self" }); // ať si admin neodebere práva sám sobě
    await pool.query("UPDATE users SET is_admin=? WHERE id=?", [req.body.is_admin ? 1 : 0, req.params.id]);
    logAct(req.session.user, "user_admin", (req.body.is_admin ? "+admin" : "-admin") + " #" + req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.session.user.id)
      return res.status(400).json({ error: "self" });
    const [t] = await pool.query("SELECT email FROM users WHERE id=?", [req.params.id]);
    await pool.query("DELETE FROM users WHERE id=?", [req.params.id]); // práva kaskádují
    logAct(req.session.user, "user_delete", t.length ? t[0].email : "#" + req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.post("/api/permissions", requireAdmin, async (req, res) => {
  try {
    const { user_id, app_key, role } = req.body || {};
    if (!user_id || !app_key || !["view", "edit"].includes(role)) return res.status(400).json({ error: "bad" });
    await pool.query(
      "INSERT INTO permissions (user_id, app_key, role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)",
      [user_id, app_key, role]);
    logAct(req.session.user, "perm_set", app_key + "=" + role + " → uživatel #" + user_id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.delete("/api/permissions", requireAdmin, async (req, res) => {
  try {
    const { user_id, app_key } = req.body || {};
    if (!user_id || !app_key) return res.status(400).json({ error: "bad" });
    await pool.query("DELETE FROM permissions WHERE user_id=? AND app_key=?", [user_id, app_key]);
    logAct(req.session.user, "perm_remove", app_key + " → uživatel #" + user_id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

// záznam aktivity (admin)
app.get("/api/activity", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows] = await pool.query(
      "SELECT email, action, detail, at FROM activity ORDER BY id DESC LIMIT ?", [limit]);
    res.json({ activity: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

// --- statické soubory (stejná doména jako API) ---
app.use(express.static(path.join(__dirname, "..", "public")));

// Při prvním startu (prázdná tabulka users) vytvoří administrátora z ADMIN_* v .env
// s vynucenou změnou hesla po prvním přihlášení.
async function bootstrapAdmin() {
  try {
    const [c] = await pool.query("SELECT COUNT(*) AS n FROM users");
    if (c[0].n > 0) return;
    const email = process.env.ADMIN_EMAIL || "admin@bobr.local";
    const password = process.env.ADMIN_PASSWORD || "admin";
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO users (email, pass_hash, is_admin, must_change_pw) VALUES (?,?,1,1)",
      [email, hash]);
    console.log(`BOBR: vytvořen první administrátor "${email}" – heslo je nutné změnit po prvním přihlášení.`);
  } catch (e) { console.error("bootstrap:", e.message); }
}

const PORT = process.env.PORT || 3000;
bootstrapAdmin().finally(() => {
  app.listen(PORT, () => console.log("BOBR běží na portu " + PORT));
});
