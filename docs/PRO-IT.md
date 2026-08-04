# BOBR — podklad pro IT

> **Stav: IT odpovědělo.** Runtime = **Node.js**, DB = **MySQL** (app i DB na stejném serveru), web = **Nginx**, GitHub pod **firemní organizací**, nasazení **ručně**, firewall/reverzní proxy **je**. Aktuální postup nasazení je v `NASTAVENI.md`. **Rozhodnuto:** aplikace bude **jen interní (LAN/VPN), na HTTP** bez veřejného certifikátu (`COOKIE_SECURE=false`).

## O co jde
**BOBR** je interní webový portál se čtyřmi aplikacemi (KPI, Produktivita strojů, Obsazení směn, Tiskové stroje). Uživatel se přihlásí a podle přidělených práv vidí a používá jednotlivé aplikace. Každá aplikace ukládá svá data (JSON) do sdílené databáze.

- **Frontend:** čisté statické HTML/CSS/JS soubory (žádný build, žádné node_modules na produkci).
- **Data + přihlášení + práva:** malá serverová API vrstva nad databází.

Původně bylo řešení navržené pro Supabase (prohlížeč mluvil s databází přímo). **Na pokyn IT migrujeme na MariaDB.** S MariaDB se z prohlížeče přímo mluvit nedá (databázi nelze vystavit do prohlížeče), proto mezi HTML a databázi přibývá zmíněná serverová API vrstva. Ta zároveň řeší přihlašování a kontrolu práv.

---

## Už rozhodnuto (zadavatelem)
- **Přihlašování:** vlastní účty (e-mail + heslo uvnitř BOBR), **bez** napojení na Active Directory / LDAP / SSO. Hesla se ukládají hashovaná (bcrypt).
- **Správa uživatelů:** zakládá a spravuje si je zadavatel sám (dodáme k tomu jednoduchý nástroj — viz Stav).
- **Dostupnost:** aplikace bude přístupná **i z internetu** → tím se **HTTPS stává povinným** a na přihlášení nasadíme běžnou ochranu (hashovaná hesla, zabezpečené cookies, omezení počtu pokusů).

## Potřebujeme od IT (blokuje dopsání backendu)

1. **Runtime backendu** — na čem může serverová část běžet? **PHP (LAMP)**, nebo **Node.js**?
   *Doporučení:* PHP — u MariaDB nejjednodušší a nejběžnější. **Hlavní blokující otázka.**

2. **MariaDB přístup**
   - Verze MariaDB / MySQL?
   - Vytvoření databáze a DB uživatele — potřebujeme **host, port, název databáze, uživatel, heslo.**
   - Je DB na stejném serveru jako aplikace (localhost), nebo samostatný DB server?

3. **Hosting a doména**
   - Kam nasadit statické soubory + API (firemní web server Apache/Nginx, interní server, VPS)?
   - Pod jakou **veřejnou doménou** to poběží? (API i HTML na **stejné doméně** — kvůli přihlašovací cookie.)

4. **HTTPS** — TLS certifikát pro tu doménu. Povinné (aplikace je vystavená na internet). Zajistí IT?

5. **Zabezpečení internetového přístupu** — je před aplikací firewall / reverzní proxy? Doporučujeme aspoň rate-limiting nebo fail2ban na přihlašování, protože je veřejně dostupná.

6. **Zálohy** — pravidelný `mysqldump` a jaká retence? (Aplikace umí i ruční export JSON jako pojistku.)

7. **GitHub** — kód bude ve verzování na GitHubu.
   - Má repozitář patřit pod **firemní GitHub organizaci**, nebo pod osobní účet? (Repozitář bude privátní.)
   - **Nasazení z GitHubu:** má se na server nasazovat automaticky (GitHub Actions → server přes SSH/rsync při pushnutí), nebo ručně? Pokud automaticky, potřebujeme deploy přístup na server (SSH klíč / cíl).

---

## Co prosíme připravit (checklist)
- [ ] Server s vybraným runtime (PHP ≥ 8.1 s PDO_MySQL, **nebo** Node.js ≥ 18).
- [ ] MariaDB databáze `bobr` v kódování `utf8mb4` + DB uživatel s právy na ni.
- [ ] Spustit přiložený `mariadb-schema.sql` (vytvoří tabulky).
- [ ] Umístění pro statické soubory + API na **stejné veřejné doméně**.
- [ ] HTTPS certifikát (povinné — veřejně dostupné).
- [ ] (doporučeno) rate-limiting / fail2ban na přihlašování.
- [ ] (doporučeno) naplánovaná záloha databáze.
- [ ] Předat nám přístupové údaje k DB (viz bod 3).

---

## Technické parametry (pro orientaci IT)
- **Objem dat:** malý — jednotky MB celkem, řádově kilobajty JSON na jednu akci. Několik uživatelů. Žádné velké výkonové nároky.
- **Databázové schéma:** tabulky `users`, `app_data` (obsah aplikace jako JSON v `LONGTEXT`), `permissions` (role `view`/`edit` per aplikace), volitelně `snapshots`. Vše v přiloženém `mariadb-schema.sql`.
- **API (návrh, ~5 endpointů):** `login`, `logout`, `me` (vrací práva uživatele), `data?app=…` (načtení), `save` (uložení). Session přes cookie, same-origin. Zápis povolen jen roli `edit` — kontrolu vynucuje API podle tabulky `permissions`.
- **Bezpečnost:** hesla hashovaná (`password_hash`/bcrypt), přístupová práva řízená v API, žádné přímé připojení prohlížeče k DB.

---

## Stav
- **Hotové:** frontend (portál BOBR + aplikace Obsazení směn jako vzor), databázové schéma pro MariaDB.
- **Zbývá (po zodpovězení výše):** dopsat backend v PHP/Node, přepnout frontend z volání Supabase na volání našeho API, převést zbylé tři aplikace, přidat jednoduchou správu uživatelů (zakládání účtů a přidělení práv view/edit bez zásahu do SQL).

Nejdůležitější odpověď na rozjezd je teď **bod 1 (runtime — PHP, nebo Node.js)**.
