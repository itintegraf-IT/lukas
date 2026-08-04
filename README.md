# BOBR

**Board for Operations, Benchmarks and Roster** — interní webový portál pro tiskárnu INTEGRAF. Po přihlášení nabízí podle přidělených práv čtyři aplikace: KPI, Produktivita strojů, Obsazení směn, Tiskové stroje. Data se ukládají do sdílené databáze (MySQL / MariaDB).

- **Frontend:** statické HTML/CSS/JS (`public/`), žádný build.
- **Backend:** Node.js + Express + MySQL (`api/`) — přihlašování, práva (view / edit / admin), ukládání dat.

## Aplikace a role
- Role **view** = jen náhled, **edit** = úpravy a ukládání, **admin** = plný přístup ke všem aplikacím včetně **obnovy dat ze zálohy** (import), který ostatním není dostupný.
- **Obsazení směn** a **produktivita** převedeny přímo. **KPI** a **Tiskové stroje** si drží data v mnoha klíčích `localStorage`, proto se zrcadlí na server přes `storage-sync.js` (jejich vnitřní logika zůstala nedotčená).

## Struktura repozitáře
```
bobr/
├─ public/              # statické soubory (servíruje je backend)
│  ├─ index.html        # portál: přihlášení + menu
│  ├─ smeny.html        # Obsazení směn (kanál Y)
│  ├─ kpi.html          # KPI (kanál C) – zrcadlení localStorage
│  ├─ produktivita.html # Produktivita (kanál M) – jen přihlášení, nic neukládá
│  ├─ stroje.html       # Tiskové stroje (kanál K) – zrcadlení localStorage
│  ├─ api.js            # datová vrstva (smeny, produktivita)
│  ├─ storage-sync.js   # zrcadlení localStorage na server (kpi, stroje)
│  └─ logo.png
├─ api/                 # backend (Node.js)
│  ├─ server.js  db.js  adduser.js  grant.js  config.example.env  package.json
├─ db/
│  └─ schema.sql
├─ docs/  ├─ NASTAVENI.md  └─ PRO-IT.md
├─ .gitignore
└─ README.md
```

## Rychlý start (vývoj)
```bash
mysql -u root -p bobr < db/schema.sql
cd api && npm install
cp config.example.env .env      # vyplň DB_* a SESSION_SECRET
npm start                       # http://localhost:3000
node adduser.js admin@firma.cz heslo --admin
node grant.js  admin@firma.cz  smeny  edit
```
Podrobně `docs/NASTAVENI.md`.

## Stav
- **Hotové:** portál a všechny čtyři aplikace převedené na server, backend (přihlášení, práva view/edit/admin, ukládání), schéma DB, grafická správa uživatelů (dlaždice pro adminy) i CLI jako záloha.
- **K otestování:** KPI a Tiskové stroje na ostrém serveru (zrcadlení localStorage). Přísnější „jen náhled" UI u těchto dvou lze doladit; data ale chrání backend (view neuloží nic) i tak.

## Bezpečnost
- Do repozitáře nikdy nepatří hesla — jediné tajemství (`.env`: heslo k DB, `SESSION_SECRET`) `.gitignore` nechává mimo verzování; commituje se jen `config.example.env`.
- Hesla uživatelů hashovaná (bcrypt). Repozitář drž jako **privátní**.
- Provoz zvolen **interní (LAN/VPN) na HTTP**, `COOKIE_SECURE=false`.
