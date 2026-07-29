# BOBR

**Board for Operations, Benchmarks and Roster** — interní webový portál pro tiskárnu INTEGRAF. Po přihlášení nabízí podle přidělených práv čtyři aplikace: KPI, Produktivita strojů, Obsazení směn, Tiskové stroje. Data se ukládají do sdílené databáze (MariaDB).

## Struktura repozitáře
```
bobr/
├─ public/              # statické soubory servírované webserverem (docroot)
│  ├─ index.html        # portál: přihlášení + menu aplikací
│  ├─ smeny.html        # aplikace Obsazení směn (vzor převodu)
│  ├─ supabase.js       # PROZATÍMNÍ datová vrstva (bude nahrazena api.js — viz Stav)
│  └─ logo.png
├─ api/                 # backend (přibude po volbě runtime — PHP/Node)
├─ db/
│  └─ mariadb-schema.sql
├─ docs/
│  ├─ NASTAVENI.md      # postup nasazení
│  └─ PRO-IT.md         # podklad a dotazy pro IT
├─ .gitignore
└─ README.md
```

## Stav
- **Hotové:** frontend (portál + aplikace Obsazení směn), schéma databáze pro MariaDB.
- **Zbývá:** po volbě runtime (PHP / Node.js) dopsat backend v `api/`, nahradit `supabase.js` za `api.js` (volání vlastního API), přidat správu uživatelů, převést zbylé tři aplikace.

## Bezpečnost — důležité
- **Do repozitáře nikdy nepatří přístupové údaje k databázi ani žádná hesla.** Skutečná konfigurace backendu (heslo k MariaDB) bude v souboru mimo verzování — je předpřipravený v `.gitignore` (`api/config.php`, `.env`). Do repa se commituje jen vzor bez hesel.
- Repozitář drž jako **privátní**.

## Nasazení
Viz `docs/NASTAVENI.md`. Ve zkratce: statické soubory z `public/` a backend z `api/` běží na firemním serveru se stejnou doménou; databázi vytvoří a schéma spustí IT (`db/mariadb-schema.sql`). GitHub slouží jako zdroj kódu — samotný běh (PHP/Node + MariaDB) zajišťuje server, ne GitHub.
