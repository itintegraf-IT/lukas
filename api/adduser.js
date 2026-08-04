// Založení / změna uživatele.
// Použití:  node adduser.js <email> <heslo> [--admin]
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

(async () => {
  const [, , email, password, flag] = process.argv;
  if (!email || !password) {
    console.log("Použití: node adduser.js <email> <heslo> [--admin]");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const isAdmin = flag === "--admin" ? 1 : 0;
  await pool.query(
    "INSERT INTO users (email, pass_hash, is_admin) VALUES (?,?,?) " +
    "ON DUPLICATE KEY UPDATE pass_hash=VALUES(pass_hash), is_admin=VALUES(is_admin)",
    [email, hash, isAdmin]);
  console.log("Uživatel uložen:", email, isAdmin ? "(admin)" : "");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
