-- ================================================================
--  BOBR – schéma databáze (MySQL 8+ / MariaDB 10.4+)
--  1) Vytvoř databázi:
--       CREATE DATABASE bobr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--  2) Spusť tento soubor:
--       mysql -u root -p bobr < schema.sql
--  Tabulku sezení (sessions) si automaticky vytvoří backend při startu.
-- ================================================================

-- Uživatelé. Heslo se ukládá výhradně jako hash (bcrypt).
-- Prvního admina vytvoří backend sám při prvním startu (viz ADMIN_* v .env) s vynucenou
-- změnou hesla; skript adduser.js zůstává jako alternativa.
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL UNIQUE,
  pass_hash      VARCHAR(255) NOT NULL,
  is_admin       TINYINT NOT NULL DEFAULT 0,
  must_change_pw TINYINT NOT NULL DEFAULT 0,
  last_login     TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Záznam aktivity (přihlášení, změny uživatelů a práv). E-mail je uložený zvlášť,
-- aby log zůstal čitelný i po smazání uživatele.
CREATE TABLE IF NOT EXISTS activity (
  id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  email   VARCHAR(190) NULL,
  action  VARCHAR(40) NOT NULL,
  detail  VARCHAR(190) NULL,
  at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data aplikací: jeden řádek na aplikaci, obsah je JSON (uložený jako text).
CREATE TABLE IF NOT EXISTS app_data (
  app_key    VARCHAR(50) PRIMARY KEY,
  data       LONGTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  CONSTRAINT fk_app_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Přístupová práva: kdo smí kterou aplikaci a jak. Vynucuje backend.
CREATE TABLE IF NOT EXISTS permissions (
  user_id INT NOT NULL,
  app_key VARCHAR(50) NOT NULL,
  role    ENUM('view','edit') NOT NULL,
  PRIMARY KEY (user_id, app_key),
  CONSTRAINT fk_perm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Volitelně: snímky v čase pro historii / obnovu po nechtěné změně.
CREATE TABLE IF NOT EXISTS snapshots (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_key  VARCHAR(50) NOT NULL,
  data     LONGTEXT NOT NULL,
  taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- Po spuštění schématu:
--   node api/adduser.js admin@firma.cz TAJNE_HESLO --admin   (první správce)
--   node api/grant.js  uzivatel@firma.cz  smeny  edit         (přidělení práv)
-- Klíče aplikací: 'kpi'  'produktivita'  'smeny'  'stroje'
-- ----------------------------------------------------------------
