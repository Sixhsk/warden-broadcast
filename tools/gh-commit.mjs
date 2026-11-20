import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN;
const REPO = 'Sixhsk/warden-broadcast';
const BRANCH = 'main';
const MSG = process.env.GH_MSG || 'fix(ui): toast auto-dismiss (v1.0.2)';
const FILES = process.argv.slice(2).filter(Boolean);

const api = (p, opts = {}) =>
  fetch('https://api.github.com' + p, {
    ...opts,
    headers: {
      Authorization: 'token ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'warden-sync',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });

const j = async (r) => {
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};

const ref = await j(await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`));
const head = ref.object.sha;
const headCommit = await j(await api(`/repos/${REPO}/git/commits/${head}`));
console.log('remote head', head.slice(0, 7), '-', headCommit.message.split('\n')[0]);

const tree = [];
for (const f of FILES) {
  const buf = fs.readFileSync(f);
  const blob = await j(
    await api(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
    }),
  );
  tree.push({ path: f.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
  console.log('blob', f, blob.sha.slice(0, 7), buf.length + 'B');
}

const newTree = await j(
  await api(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  }),
);

const commit = await j(
  await api(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: MSG, tree: newTree.sha, parents: [head] }),
  }),
);
console.log('new commit', commit.sha.slice(0, 7));

await j(
  await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  }),
);
console.log('OK ref updated →', commit.sha);

// 本地 origin/main 也跟上，避免后续 diff 混乱
fs.writeFileSync('.gh-head.txt', commit.sha + '\n');