const express = require('express'), fs = require('fs'), path = require('path');
const app = express();
// Password protection: active only when SITE_PASSWORD is set (any username works).
const PASS = process.env.SITE_PASSWORD;
if (PASS) {
  app.use((req, res, next) => {
    const b64 = (req.headers.authorization || '').split(' ')[1] || '';
    const given = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':');
    if (given === PASS) return next();
    res.set('WWW-Authenticate', 'Basic realm="People Galaxy"').status(401).send('Password required');
  });
}
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Postgres when DATABASE_URL is set (Render), otherwise a local JSON file.
let pool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
}
const FILE = path.join(__dirname, 'data.json');
const empty = { people: [], links: [] };

async function load() {
  if (pool) {
    await pool.query('create table if not exists galaxy (id int primary key, doc jsonb not null)');
    const r = await pool.query('select doc from galaxy where id = 1');
    return r.rows[0] ? r.rows[0].doc : empty;
  }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return empty; }
}
async function save(doc) {
  if (pool) {
    await pool.query('insert into galaxy (id, doc) values (1, $1) on conflict (id) do update set doc = $1', [doc]);
  } else fs.writeFileSync(FILE, JSON.stringify(doc));
}

app.get('/api/graph', async (_q, s) => { try { s.json(await load()); } catch (e) { s.status(500).json({ error: e.message }); } });
app.put('/api/graph', async (q, s) => {
  try { await save({ people: q.body.people || [], links: q.body.links || [] }); s.json({ ok: true }); }
  catch (e) { s.status(500).json({ error: e.message }); }
});
app.listen(process.env.PORT || 3000, () => console.log('People Galaxy running'));
