/* ================================================================
   BOBR – zrcadlení localStorage na server pro velké aplikace,
   které si data drží v mnoha klíčích localStorage (KPI, Tiskové stroje).
   Nepřepisuje vnitřní logiku aplikace: jen před spuštěním nalije data
   ze serveru do localStorage a při změnách je posílá zpět.

   V HTML se PŘED tímto skriptem nastaví:
     window.BOBR_APP  = "kpi";                 // klíč aplikace
     window.BOBR_KEYS = ["igf_"];              // prefixy klíčů této aplikace
   ================================================================ */
(async function () {
  const appKey = window.BOBR_APP;
  const prefixes = window.BOBR_KEYS || [];
  if (!appKey) return;
  const inScope = k => prefixes.some(p => k && k.startsWith(p));

  // --- ověření + práva ---
  let me = null;
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    if (!r.ok) { location.replace("index.html"); return; }
    me = await r.json();
  } catch (e) { location.replace("index.html"); return; }

  const perm = (me.permissions || []).find(p => p.app_key === appKey);
  const isAdmin = !!me.is_admin;
  const canView = isAdmin || !!perm;
  if (!canView) {
    document.body.innerHTML = '<p style="padding:26px;font:16px system-ui">Nemáš přístup k této aplikaci. <a href="index.html">Zpět na panel</a></p>';
    return;
  }
  const canEdit = isAdmin || (perm && perm.role === "edit");
  window.BOBR_CAN_EDIT = canEdit;
  window.BOBR_IS_ADMIN = isAdmin;

  const SYNCED = "bobr_synced_" + appKey;

  // --- jednorázová synchronizace ze serveru do localStorage, pak reload ---
  if (!sessionStorage.getItem(SYNCED)) {
    let blob = null;
    try {
      const r = await fetch("/api/data?app=" + encodeURIComponent(appKey), { credentials: "include" });
      if (r.ok) blob = (await r.json()).data;
    } catch (e) {}

    if (blob && typeof blob === "object") {
      // server má data → přepiš lokální kopii aplikace
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (inScope(k)) localStorage.removeItem(k);
      }
      for (const k in blob) if (inScope(k)) localStorage.setItem(k, blob[k]);
    } else if (canEdit) {
      // server je prázdný → nasei ho ze stávajících lokálních dat (první migrace)
      const snap = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (inScope(k)) snap[k] = localStorage.getItem(k);
      }
      if (Object.keys(snap).length) {
        try {
          await fetch("/api/save", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app: appKey, data: snap }),
          });
        } catch (e) {}
      }
    }
    sessionStorage.setItem(SYNCED, "1");
    location.reload();
    return; // po reloadu poběží druhá větev
  }

  // --- po reloadu: data jsou v localStorage, aplikace si je načte sama ---

  // mini-lišta BOBR (návrat, role, odhlášení) + skrytí obnovy ze zálohy pro neadminy
  const ready = fn => (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", fn) : fn();
  ready(() => {
    const rl = isAdmin ? "admin" : (canEdit ? "editace" : "náhled");
    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;top:8px;right:10px;z-index:99999;display:flex;gap:6px;align-items:center;font:12px system-ui";
    bar.innerHTML =
      '<a href="index.html" style="color:#333;text-decoration:none;background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px">← BOBR</a>' +
      '<span style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px;color:#777">' + rl + '</span>' +
      '<button id="bobrLogout" style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px;cursor:pointer;color:#333">Odhlásit</button>';
    document.body.appendChild(bar);
    document.getElementById("bobrLogout").onclick = async () => {
      try { await fetch("/api/logout", { method: "POST", credentials: "include" }); } catch (e) {}
      sessionStorage.removeItem(SYNCED);
      location.replace("index.html");
    };
    // obnova ze zálohy je jen pro administrátora
    if (!isAdmin) {
      (window.BOBR_RESTORE_HIDE || []).forEach(sel => {
        document.querySelectorAll(sel).forEach(el => { el.style.display = "none"; });
      });
    }
  });

  // sleduj změny a posílej snapshot na server (jen s právem editace / admin)
  if (canEdit) {
    const origSet = localStorage.setItem.bind(localStorage);
    const origRemove = localStorage.removeItem.bind(localStorage);
    let t = null;
    const push = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const snap = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (inScope(k)) snap[k] = localStorage.getItem(k);
        }
        fetch("/api/save", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: appKey, data: snap }),
        }).catch(() => {});
      }, 800);
    };
    localStorage.setItem = function (k, v) { origSet(k, v); if (inScope(k)) push(); };
    localStorage.removeItem = function (k) { origRemove(k); if (inScope(k)) push(); };
  }
})();
