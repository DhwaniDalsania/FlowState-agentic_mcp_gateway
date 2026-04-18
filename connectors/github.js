/**
 * GitHub Connector — uses req.session.githubToken and req.session.githubRepoFullName
 */

const { getReq } = require('../requestContext');
const { getSecret } = require('../vault');

const ALLOWED_ACTIONS = ['create_branch', 'create_pr', 'merge_pr'];

function getToken() {
  const req = getReq();
  const sessionTok = req && req.session && req.session.githubToken;
  return sessionTok || getSecret('GITHUB_TOKEN') || '';
}

function getRepoFullName() {
  const req = getReq();
  const sessionRepo = req && req.session && req.session.githubRepoFullName;
  return sessionRepo || getSecret('GITHUB_REPO') || '';
}

async function githubFetch(path, options = {}) {
  const token = getToken();
  if (!token) {
    throw new Error('GitHub not connected: missing session token (connect via OAuth or set GITHUB_TOKEN)');
  }
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText || 'GitHub API error';
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

async function execute(action, data) {
  console.log(`[GitHub Connector] Executing ${action}...`);

  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Unauthorized action: ${action} for GitHub`);
  }

  switch (action) {
    case 'create_branch': {
      const fullName = getRepoFullName();
      if (!fullName) {
        throw new Error('No repository selected. Choose a repo in the UI or set GITHUB_REPO=owner/name');
      }
      const branchName = (data && data.branchName) || `workflow/${Date.now().toString(36)}`;
      const repo = await githubFetch(`/repos/${fullName}`);
      const defaultBranch = repo.default_branch || 'main';
      const refData = await githubFetch(`/repos/${fullName}/git/ref/heads/${defaultBranch}`);
      const sha = refData.object && refData.object.sha;
      if (!sha) {
        throw new Error('Could not resolve default branch SHA');
      }
      await githubFetch(`/repos/${fullName}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha })
      });
      const timestamp = new Date().toISOString();
      return {
        branch: branchName,
        repo: fullName,
        sha,
        status: 'OK',
        timestamp,
        message: 'Branch created successfully'
      };
    }
    case 'create_pr':
      return {
        pr_number: Math.floor(Math.random() * 1000),
        url: `https://github.com/${getRepoFullName() || 'owner/repo'}/pull/1`
      };
    case 'merge_pr':
      return { success: true };
    default:
      return { success: true };
  }
}

module.exports = { execute };
