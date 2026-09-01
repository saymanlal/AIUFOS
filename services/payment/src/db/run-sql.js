const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-sql.js <path-to-sql-file>');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  await pool.query(sql);
  console.log(`Executed: ${file}`);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
