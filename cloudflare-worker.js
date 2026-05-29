const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(env) }
  });
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ai-prompt-log-worker'
  };
}

function requireConfig(env) {
  const missing = ['GITHUB_TOKEN', 'REPO_OWNER', 'REPO_NAME', 'ACCESS_CODE']
    .filter(key => !env[key]);
  if (missing.length > 0) {
    return `Cloudflare Worker secret/env missing: ${missing.join(', ')}`;
  }
  return '';
}

function isAllowed(request, env) {
  return request.headers.get('X-Access-Code') === env.ACCESS_CODE;
}

async function githubFetch(path, env, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(env),
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    let message = `GitHub API error: ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {}
    throw new Error(message);
  }

  return res;
}

async function listRecords(request, env) {
  const url = new URL(request.url);
  const label = url.searchParams.get('label') || env.ISSUE_LABEL || 'ai-prompt-log';
  const query = new URLSearchParams({
    labels: label,
    state: 'open',
    per_page: '100'
  });

  const res = await githubFetch(`/issues?${query}`, env);
  return json(await res.json(), 200, env);
}

async function createRecord(request, env) {
  const data = await request.json();
  if (!data.title || !data.body) {
    return json({ message: 'title and body are required' }, 400, env);
  }

  const labels = Array.isArray(data.labels) && data.labels.length > 0
    ? data.labels
    : [env.ISSUE_LABEL || 'ai-prompt-log'];

  const res = await githubFetch('/issues', env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      body: data.body,
      labels
    })
  });

  return json(await res.json(), 201, env);
}

async function uploadImage(request, env) {
  const data = await request.json();
  const path = String(data.path || '').replace(/^\/+/, '');
  const content = String(data.content || '');

  if (!path.startsWith('uploads/') || !content) {
    return json({ message: 'uploads/ path and base64 content are required' }, 400, env);
  }

  const branch = env.BRANCH || 'main';
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await githubFetch(`/contents/${apiPath}`, env, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: data.message || `Upload ${path}`,
      content,
      branch
    })
  });

  const result = await res.json();
  const downloadUrl = result.content?.download_url
    || `https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${branch}/${apiPath}`;

  return json({ download_url: downloadUrl, path }, 201, env);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const configError = requireConfig(env);
    if (configError) return json({ message: configError }, 500, env);
    if (!isAllowed(request, env)) return json({ message: 'Invalid access code' }, 401, env);

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/records') {
        return listRecords(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/records') {
        return createRecord(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/upload') {
        return uploadImage(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true }, 200, env);
      }
      return json({ message: 'Not found' }, 404, env);
    } catch (err) {
      return json({ message: err.message || 'Worker error' }, 500, env);
    }
  }
};
