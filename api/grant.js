// Přidělení práva uživateli k aplikaci.
// Použití:  node grant.js <email> <kpi|produktivita|smeny|stroje> <view|edit>
require("dotenv").config();
const { pool } = require("./db");

(async () => {
  const [, , email, appKey, role] = process.argv;
  if (!email || !appKey || !["view", "edit"].includes(role)) {
    console.log("Použití: node grant.js <email> <kpi|produktivita|smeny|stroje> <view|edit>");
    process.exit(1);
  }
  const [u] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
  if (!u.length) { console.log("Uživatel neexistuje:", email); process.exit(1); }
  await pool.query(
    "INSERT INTO permissions (user_id, app_key, role) VALUES (?,?,?) " +
    "ON DUPLICATE KEY UPDATE role=VALUES(role)",
    [u[0].id, appKey, role]);
  console.log(`Právo nastaveno: ${email} → ${appKey} = ${role}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
