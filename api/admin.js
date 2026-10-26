// Admin API for the Process Lab start page.
// Reads and writes exercises.json in the GitHub repo, so the repo stays the single source of truth.
// Needs two environment variables in the Vercel project: ADMIN_PASSWORD and GITHUB_TOKEN.
const crypto = require('crypto');

const OWNER = 'battyaggie';
const REPO = 'process-lab';
const FILE = 'exercises.json';
const BRANCH = 'main';

const q = JSON.stringify;

// Writes exercises.json in the same layout as the file in the repo, so commits only show real changes.
function format(d) {
  const inline = (v) => (Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : q(v));
  const programmes = d.programmes
    .map((p) => '    { ' + Object.entries(p).map(([k, v]) => q(k) + ': ' + q(v)).join(', ') + ' }')
    .join(',\n');
  const exercises = d.exercises
    .map((e) => '    {\n' + Object.entries(e).map(([k, v]) => '      ' + q(k) + ': ' + inline(v)).join(',\n') + '\n    }')
    .join(',\n');
  return '{\n  "_note": ' + q(d._note) + ',\n  "programmes": [\n' + programmes + '\n  ],\n  "exercises": [\n' + exercises + '\n  ]\n}\n';
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeHandler(fetchImpl, env = process.env, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
  const headers = () => ({
    Authorization: 'Bearer ' + env.GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'process-lab-admin'
  });

  async function readFile() {
    const r = await fetchImpl(api + '?ref=' + BRANCH, { headers: headers() });
    if (!r.ok) throw Object.assign(new Error('github_read_' + r.status), { status: r.status });
    const j = await r.json();
    const data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
    return { data, sha: j.sha };
  }

  async function writeFile(data, sha) {
    const body = {
      message: 'Admin page: update Studiengang assignments',
      content: Buffer.from(format(data), 'utf8').toString('base64'),
      sha,
      branch: BRANCH
    };
    const r = await fetchImpl(api, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw Object.assign(new Error('github_write_' + r.status), { status: r.status });
    return r.json();
  }

  // Applies only the programme assignments of exercises that already exist. Nothing else can be changed from here.
  function applyAssignments(data, assignments) {
    const known = new Set(data.programmes.map((p) => p.id));
    const order = data.programmes.map((p) => p.id);
    const byId = new Map(data.exercises.map((e) => [e.id, e]));
    for (const [id, list] of Object.entries(assignments)) {
      if (!byId.has(id)) throw Object.assign(new Error('unknown_exercise'), { status: 400 });
      if (!Array.isArray(list) || list.some((p) => !known.has(p))) throw Object.assign(new Error('unknown_programme'), { status: 400 });
    }
    for (const [id, list] of Object.entries(assignments)) {
      const set = new Set(list);
      byId.get(id).programmes = order.filter((p) => set.has(p));
    }
    return data;
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    const send = (status, obj) => res.status(status).json(obj);

    if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

    const missing = ['ADMIN_PASSWORD', 'GITHUB_TOKEN'].filter((k) => !env[k]);
    if (missing.length) return send(503, { error: 'not_configured', missing });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object') return send(400, { error: 'bad_request' });

    if (!safeEqual(body.password || '', env.ADMIN_PASSWORD)) {
      await sleep(800);
      return send(401, { error: 'wrong_password' });
    }

    try {
      if (body.action === 'load') {
        const { data } = await readFile();
        return send(200, { data });
      }
      if (body.action === 'save') {
        if (!body.assignments || typeof body.assignments !== 'object' || Array.isArray(body.assignments)) return send(400, { error: 'bad_request' });
        for (let attempt = 0; attempt < 2; attempt++) {
          const { data, sha } = await readFile();
          const updated = applyAssignments(data, body.assignments);
          try {
            await writeFile(updated, sha);
            return send(200, { ok: true, data: updated });
          } catch (e) {
            if (e.status === 409 && attempt === 0) continue; // file changed meanwhile: read again and retry once
            throw e;
          }
        }
      }
      return send(400, { error: 'unknown_action' });
    } catch (e) {
      if (e.status === 400) return send(400, { error: e.message });
      if (e.status === 401 || e.status === 403 || e.status === 404) return send(502, { error: 'github_access', detail: e.message });
      return send(502, { error: 'github_error', detail: e.message });
    }
  };
}

const handler = makeHandler((...a) => fetch(...a));
handler.makeHandler = makeHandler;
handler.format = format;
module.exports = handler;
