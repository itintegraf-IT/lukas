/* ================================================================
   BOBR – datová vrstva pro frontend. Volá vlastní backend na stejné
   doméně (/api/…). Neobsahuje žádné tajné údaje.
   Funkce mají stejná jména jako dřív, takže aplikace se nemění.
   ================================================================ */
const API = "/api";
let _me = null;

/* {email, is_admin, permissions:[{app_key, role}]} nebo null */
async function getMe() {
  if (_me) return _me;
  try {
    const r = await fetch(API + "/me", { credentials: "include" });
    if (!r.ok) return null;
    _me = await r.json();
    return _me;
  } catch (e) { return null; }
}

async function apiLogin(email, password) {
  const r = await fetch(API + "/login", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return false;
  _me = null;               // vynutí čerstvé načtení práv
  return true;
}

/* Ověří přihlášení; když chybí, přesměruje na portál a vrátí null. */
async function requireAuth(loginUrl = "index.html") {
  const me = await getMe();
  if (!me) { location.replace(loginUrl); return null; }
  return me;
}

/* Role uživatele pro aplikaci: "edit" | "view" | null */
async function getRole(appKey) {
  const me = await getMe();
  if (!me) return null;
  const p = (me.permissions || []).find(x => x.app_key === appKey);
  return p ? p.role : null;
}

/* Načte uložený objekt aplikace (nebo null). */
async function loadAppData(appKey) {
  const r = await fetch(`${API}/data?app=${encodeURIComponent(appKey)}`, { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  return j.data ?? null;
}

/* Uloží objekt aplikace na server. */
async function saveAppData(appKey, obj) {
  const r = await fetch(API + "/save", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app: appKey, data: obj }),
  });
  if (!r.ok) throw new Error("save failed " + r.status);
}

async function signOut(loginUrl = "index.html") {
  try { await fetch(API + "/logout", { method: "POST", credentials: "include" }); } catch (e) {}
  _me = null;
  location.replace(loginUrl);
}
