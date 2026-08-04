// Připojení k MySQL/MariaDB. Údaje se berou z .env (viz config.example.env).
require("dotenv").config();
const mysql = require("mysql2/promise");

const dbConfig = {
  host:     process.env.DB_HOST || "localhost",
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset:  "utf8mb4",
};

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = { pool, dbConfig };
