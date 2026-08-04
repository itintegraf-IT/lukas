# BOBR — nasazení do provozu, krok za krokem

Cílový stav: interní web na firemním serveru (Linux), Node.js + MySQL/MariaDB na stejném stroji, Nginx jako reverzní proxy, přístup jen z interní sítě (HTTP). Příkazy jsou pro Ubuntu/Debian; na jiné distribuci se liší jen správce balíčků.

Značky `VELKÝMI_PÍSMENY` = doplň svou hodnotu.

---

## 0) Co mít připravené (od IT)
- Server s Linuxem a SSH přístupem (jméno + heslo/klíč).
- Nainstalované: **Node.js ≥ 18**, **MySQL/MariaDB**, **Nginx**.
- Ověř verze na serveru: `node -v`, `mysql --version`, `nginx -v`.
- Interní doménu (např. `bobr.firma.local`) nasměrovanou na IP serveru, nebo aspoň IP serveru.

---

## 1) Nahrát kód na GitHub (z tvého počítače)
Na GitHubu si ve firemní organizaci vytvoř **privátní** repozitář `bobr` (prázdný, bez README). Pak rozbal `bobr.zip` a v jeho složce spusť:
```bash
cd bobr
git init
git add .
git commit -m "BOBR: první verze"
git branch -M main
git remote add origin https://github.com/ORGANIZACE/bobr.git
git push -u origin main
```
Push si vyžádá přihlášení k GitHubu (jméno + Personal Access Token místo hesla).

---

## 2) Přihlásit se na server
```bash
ssh UZIVATEL@IP_SERVERU
```

## 3) Stáhnout kód na server
```bash
cd /opt
sudo git clone https://github.com/ORGANIZACE/bobr.git
sudo chown -R $USER:$USER /opt/bobr
cd /opt/bobr
```
(Privátní repo si vyžádá GitHub jméno + token. Alternativa bez gitu: nahraj `bobr.zip` přes SFTP a rozbal `unzip bobr.zip`.)

---

## 4) Databáze
Pokud DB a uživatele **nevytvořilo IT**, udělej to:
```bash
sudo mysql
```
a v MySQL konzoli:
```sql
CREATE DATABASE bobr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bobr'@'localhost' IDENTIFIED BY 'SILNE_DB_HESLO';
GRANT ALL PRIVILEGES ON bobr.* TO 'bobr'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
Pak nahraj tabulky:
```bash
mysql -u bobr -p bobr < db/schema.sql
```

---

## 5) Backend – instalace a konfigurace
```bash
cd /opt/bobr/api
npm install
cp config.example.env .env
```
Vygeneruj tajný klíč pro sezení:
```bash
openssl rand -hex 32
```
Otevři `.env` a vyplň:
```bash
nano .env
```
```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=bobr
DB_USER=bobr
DB_PASSWORD=SILNE_DB_HESLO
SESSION_SECRET=VLOŽ_VYGENEROVANÝ_KLÍČ
COOKIE_SECURE=false
```
Ulož (Ctrl+O, Enter, Ctrl+X). Zamkni práva k souboru s heslem:
```bash
chmod 600 .env
```

## 6) První administrátor
Nemusíš nic spouštět ručně. Při **prvním startu** (když je tabulka uživatelů prázdná) BOBR sám vytvoří administrátora z hodnot v `.env`:
```
ADMIN_EMAIL=admin@firma.cz
ADMIN_PASSWORD=zvol-neco-docasneho
```
Po prvním přihlášení tímto účtem si **BOBR vynutí změnu hesla**. Další uživatele, hesla i práva už pak spravuješ v aplikaci — dlaždicí **Správa uživatelů** (`/admin.html`).

*(Alternativa přes příkazovou řádku, kdybys ji potřeboval: `node adduser.js email heslo --admin` a `node grant.js email smeny edit`.)*

## 7) Zkušební spuštění
```bash
npm start
```
V prohlížeči otevři `http://IP_SERVERU:3000`, přihlas se jako admin, zkontroluj menu a aplikace. Pak zastav (Ctrl+C).

---

## 8) Trvalý běh přes systemd
Zjisti cestu k Node:
```bash
which node
```
Vytvoř službu:
```bash
sudo nano /etc/systemd/system/bobr.service
```
Vlož (uprav `WorkingDirectory`, `ExecStart` cestu k node a `User`):
```ini
[Unit]
Description=BOBR
After=network.target mysql.service

[Service]
WorkingDirectory=/opt/bobr/api
ExecStart=/usr/bin/node server.js
EnvironmentFile=/opt/bobr/api/.env
Restart=always
User=UZIVATEL

[Install]
WantedBy=multi-user.target
```
Spusť a nastav automatický start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bobr
sudo systemctl status bobr
```
Ve výpisu má být `active (running)`. Logy případně: `journalctl -u bobr -f`.

---

## 9) Nginx (reverzní proxy, čistá adresa na portu 80)
```bash
sudo nano /etc/nginx/sites-available/bobr
```
```nginx
server {
    listen 80;
    server_name bobr.firma.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktivuj a načti:
```bash
sudo ln -s /etc/nginx/sites-available/bobr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 10) Otevřít a ověřit
V prohlížeči v interní síti otevři `http://bobr.firma.local` (nebo IP serveru). Přihlas se, projdi aplikace. Hotovo.

---

## Aktualizace v budoucnu
Když do GitHubu pushneš novou verzi, na serveru:
```bash
cd /opt/bobr
git pull
cd api && npm install
sudo systemctl restart bobr
```

## Zálohy databáze
Denní záloha přes cron (`sudo crontab -e`):
```
0 2 * * * mysqldump -u bobr -pSILNE_DB_HESLO bobr > /zalohy/bobr-$(date +\%F).sql
```
(Čistší je heslo neuvádět v příkazu, ale v souboru `~/.my.cnf` s právy 600.)

## Když něco nefunguje
- **Přihlášení hlásí chybu / 500:** špatné údaje v `.env` (DB_USER/DB_PASSWORD/DB_NAME). Zkontroluj `journalctl -u bobr -f`.
- **Port 3000 obsazený:** změň `PORT` v `.env` a v Nginx `proxy_pass`, pak restart služby a reload Nginx.
- **Stránka nejede:** `sudo systemctl status bobr` a `sudo nginx -t`.
- **KPI / Tiskové stroje:** při prvním otevření udělají jedno rychlé přenačtení (natažení dat ze serveru) — to je v pořádku.
