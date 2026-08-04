/* ================================================================
   BOBR – přímé ukládání velkých aplikací (KPI, Tiskové stroje) na server.
   Nahrazuje dřívější zrcadlení localStorage. Data NEjdou do úložiště
   prohlížeče (žádný 5MB limit), ale drží se v paměti a ukládají na server.

   Aplikace se nemění – jen jí "podstrčíme" localStorage, který místo
   prohlížeče čte/píše do paměti a synchronizuje se serverem.

   V HTML se PŘED tímto skriptem nastaví:
     window.BOBR_APP  = "kpi";
     window.BOBR_KEYS = ["igf_"];
     window.BOBR_RESTORE_HIDE = ['...'];   // volitelně
   ================================================================ */
(function () {
  var appKey = window.BOBR_APP;
  var prefixes = window.BOBR_KEYS || [];
  if (!appKey) return;
  function inScope(k){ if(k==null) return false; for (var i=0;i<prefixes.length;i++){ if(String(k).indexOf(prefixes[i])===0) return true; } return false; }

  function syncReq(method, url, body){
    try {
      var x = new XMLHttpRequest();
      x.open(method, url, false);            // synchronně – data musí být dřív, než se aplikace spustí
      x.withCredentials = true;
      if (body != null) x.setRequestHeader("Content-Type", "application/json");
      x.send(body != null ? body : null);
      return { status: x.status, text: x.responseText };
    } catch (e) { return { status: 0, text: "" }; }
  }

  // --- ověření + práva ---
  var meR = syncReq("GET", "/api/me");
  if (meR.status !== 200) { location.replace("index.html"); throw new Error("bobr:no-auth"); }
  var me = JSON.parse(meR.text);
  var perm = (me.permissions || []).filter(function(p){ return p.app_key === appKey; })[0];
  var isAdmin = !!me.is_admin;
  var canView = isAdmin || !!perm;
  if (!canView) {
    document.documentElement.innerHTML = '<body style="font:16px system-ui;padding:24px">Nemáš přístup k této aplikaci. <a href="index.html">Zpět na panel</a></body>';
    throw new Error("bobr:no-access");
  }
  var canEdit = isAdmin || (perm && perm.role === "edit");
  window.BOBR_CAN_EDIT = canEdit;
  window.BOBR_IS_ADMIN = isAdmin;

  // skutečné úložiště prohlížeče (pro klíče mimo tuto aplikaci)
  var real = window.localStorage;

  // --- načtení dat ze serveru do paměti ---
  var mem = {};
  var dataR = syncReq("GET", "/api/data?app=" + encodeURIComponent(appKey));
  var serverData = null;
  if (dataR.status === 200) { try { serverData = JSON.parse(dataR.text).data; } catch (e) {} }

  if (serverData && typeof serverData === "object" && Object.keys(serverData).length) {
    // server má data → použij je
    for (var k in serverData) if (serverData.hasOwnProperty(k)) mem[k] = serverData[k];
  } else if (canEdit) {
    // server je prázdný → vezmi data z tohoto prohlížeče (první migrace / záchrana) a ulož je na server
    for (var i = 0; i < real.length; i++) {
      var rk = real.key(i);
      if (inScope(rk)) mem[rk] = real.getItem(rk);
    }
    if (Object.keys(mem).length) {
      var sr = syncReq("POST", "/api/save", JSON.stringify({ app: appKey, data: mem }));
      if (sr.status < 200 || sr.status >= 300) console.error("BOBR: první uložení na server selhalo, HTTP", sr.status);
    }
  }

  // --- ukládání na server (odloženě po změnách) ---
  var saveTimer = null, saveState = "";
  function setSaveState(s){ saveState = s; var el = document.getElementById("bobrSave"); if (el){ el.textContent = s; el.style.color = (s.indexOf("neuloženo")>=0) ? "#d00" : "#2a7"; } }
  function scheduleSave(){
    if (!canEdit) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      var payload = {};
      for (var k in mem) if (mem.hasOwnProperty(k)) payload[k] = mem[k];
      setSaveState("ukládám…");
      fetch("/api/save", { method:"POST", credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ app: appKey, data: payload }) })
        .then(function(r){ if (r.ok){ setSaveState("uloženo"); } else { console.error("BOBR: uložení selhalo, HTTP", r.status); setSaveState("⚠ neuloženo ("+r.status+")"); } })
        .catch(function(e){ console.error("BOBR: uložení selhalo:", e); setSaveState("⚠ neuloženo"); });
    }, 600);
  }

  // --- podstrčený localStorage: in-scope klíče do paměti, ostatní do skutečného úložiště ---
  function memKeys(){ return Object.keys(mem); }
  function realKeysOut(){ var a=[]; for (var i=0;i<real.length;i++){ var kk=real.key(i); if(!inScope(kk)) a.push(kk); } return a; }

  var shim = {
    getItem: function(k){ return inScope(k) ? (mem.hasOwnProperty(k) ? mem[k] : null) : real.getItem(k); },
    setItem: function(k, v){ if (inScope(k)) { mem[k] = String(v); scheduleSave(); } else { real.setItem(k, v); } },
    removeItem: function(k){ if (inScope(k)) { delete mem[k]; scheduleSave(); } else { real.removeItem(k); } },
    clear: function(){ for (var k in mem) delete mem[k]; scheduleSave(); },
    key: function(i){ var ks = memKeys().concat(realKeysOut()); return i < ks.length ? ks[i] : null; }
  };
  Object.defineProperty(shim, "length", { get: function(){ return memKeys().length + realKeysOut().length; } });

  try {
    Object.defineProperty(window, "localStorage", { configurable: true, get: function(){ return shim; } });
  } catch (e) { console.error("BOBR: localStorage se nepodařilo podstrčit:", e); }

  // --- lišta BOBR + skrytí obnovy ze zálohy pro neadminy ---
  var ready = function(fn){ (document.readyState === "loading") ? document.addEventListener("DOMContentLoaded", fn) : fn(); };
  ready(function(){
    var rl = isAdmin ? "admin" : (canEdit ? "editace" : "náhled");
    var bar = document.createElement("div");
    bar.style.cssText = "position:fixed;top:8px;right:10px;z-index:99999;display:flex;gap:6px;align-items:center;font:12px system-ui";
    bar.innerHTML =
      '<span id="bobrSave" style="font:11px system-ui"></span>' +
      '<a href="index.html" style="color:#333;text-decoration:none;background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px">← BOBR</a>' +
      '<span style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px;color:#777">' + rl + '</span>' +
      '<button id="bobrLogout" style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px;cursor:pointer;color:#333">Odhlásit</button>';
    document.body.appendChild(bar);
    setSaveState(saveState);
    document.getElementById("bobrLogout").onclick = function(){
      fetch("/api/logout", { method:"POST", credentials:"include" }).catch(function(){}).then(function(){ location.replace("index.html"); });
    };
    if (!isAdmin) {
      (window.BOBR_RESTORE_HIDE || []).forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){ el.style.display = "none"; });
      });
    }
  });
})();
