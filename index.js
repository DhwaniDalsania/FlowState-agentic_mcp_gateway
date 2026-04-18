const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const { parseWorkflow, analyzeConfidence } = require('./parser');
const { execSync } = require('child_process');
const { Executor } = require('./executor');
const { run: runContext } = require('./requestContext');
const { recordExecution, optimizeWorkflow } = require('./evolution');
const { getSecret, setSecret, getAllSecretsStatus } = require('./vault');
require('dotenv').config();

// ─── In-memory telemetry store ────────────────────────────────────────────────
const telemetry = {
  totalRuns: 0,
  successCount: 0,
  totalExecutionMs: 0
};

// ─── Demo Workflows ───────────────────────────────────────────────────────────
const DEMO_WORKFLOWS = [
  {
    id: 'release-flow',
    name: '🚀 Release Flow',
    description: 'Notion → GitHub → Sheets → Slack',
    prompt: 'Create a release task in Notion, open a GitHub branch, log it to Sheets, and notify the team on Slack'
  },
  {
    id: 'bug-triage',
    name: '🐛 Bug Triage',
    description: 'Create bug tasks and track them',
    prompt: 'Create Notion tasks for triaging a critical production bug, open a hotfix branch in GitHub, log the incident to Sheets, and alert on Slack'
  },
  {
    id: 'sprint-kickoff',
    name: '📅 Sprint Kickoff',
    description: 'Set up a new sprint across all tools',
    prompt: 'Create sprint planning tasks in Notion, create a sprint branch in GitHub, update the sprint tracker in Sheets, and post sprint goals to Slack'
  }
];

const DEFAULT_PORT = 3002;
function oauthCallbackBaseUrl() {
  const p = parseInt(String(process.env.PORT || ''), 10);
  const port = Number.isFinite(p) && p > 0 ? p : DEFAULT_PORT;
  return `http://localhost:${port}`;
}

const app = express();

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'agentic-mcp-gateway-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);
app.use(morgan('dev'));
app.use(express.json());

// Root route - Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Telemetry ────────────────────────────────────────────────────────────────
app.get('/telemetry', (req, res) => {
  const successRate = telemetry.totalRuns === 0
    ? 0
    : Math.round((telemetry.successCount / telemetry.totalRuns) * 100) / 100;
  const avgExecutionTime = telemetry.totalRuns === 0
    ? 0
    : Math.round(telemetry.totalExecutionMs / telemetry.totalRuns);
  res.json({
    totalRuns: telemetry.totalRuns,
    successRate,
    avgExecutionTime
  });
});

// ─── Demo Workflows ───────────────────────────────────────────────────────────
app.get('/api/demo-workflows', (req, res) => {
  res.json({ workflows: DEMO_WORKFLOWS });
});

// ─── Intent Confidence Analysis ───────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: "Missing 'text' field" });
  try {
    const analysis = await analyzeConfidence(text.slice(0, 500));
    res.json(analysis);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Git Commits ──────────────────────────────────────────────────────────────
app.get('/api/git/commits', async (req, res) => {
  const token = req.session.githubToken || getSecret('GITHUB_TOKEN');
  const repoFullName = req.session.githubRepoFullName;

  // If GitHub is connected and a repo is selected, fetch from GitHub API
  if (token && repoFullName) {
    try {
      const gRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=20`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Agentic-MCP-Gateway'
        }
      });
      const list = await gRes.json();
      if (gRes.ok && Array.isArray(list)) {
        const commits = list.map(c => ({
          hash: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0]
        }));
        return res.json({ total: commits.length, commits, source: 'github', repo: repoFullName });
      }
    } catch (err) {
      console.error('[Git] GitHub fetch failed:', err.message);
    }
  }

  // Fallback to local git repository
  try {
    const logRaw = execSync('git log --oneline -n 20', {
      cwd: __dirname, timeout: 5000
    }).toString().trim();
    const lines = logRaw ? logRaw.split('\n') : [];
    const commits = lines.map(line => {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) return { hash: line.trim(), message: '' };
      return { hash: line.slice(0, spaceIdx).trim(), message: line.slice(spaceIdx + 1).trim() };
    }).filter(c => c.hash);
    res.json({ total: commits.length, commits, source: 'local' });
  } catch (err) {
    res.json({ total: 0, commits: [], error: 'Git not available' });
  }
});

// ─── Vault Status ─────────────────────────────────────────────────────────────
app.get('/api/vault/status', (req, res) => {
  res.json({ secrets: getAllSecretsStatus() });
});

app.post('/api/vault/set', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing 'key'" });
  setSecret(key, value);
  res.json({ ok: true });
});

// ─── Agents Status ────────────────────────────────────────────────────────────
const agentStartTime = Date.now();
app.get('/api/agents/status', (req, res) => {
  const uptimeMs = Date.now() - agentStartTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const agents = [
    { id: 'AGT-0x4a2f', name: 'Notion Agent', codename: 'KINETIC', status: 'running', memory: '42 MB', uptime: `${h}h ${m.toString().padStart(2, '0')}m`, connector: 'notion' },
    { id: 'AGT-0x7c91', name: 'GitHub PR Merger', codename: 'KINETIC-42', status: telemetry.totalRuns > 0 ? 'executing' : 'running', memory: '18 MB', uptime: `0h ${Math.min(m, 59).toString().padStart(2, '0')}m`, connector: 'github' },
    { id: 'AGT-0x3c12', name: 'Google Sheets Sync', codename: 'releases_log', status: 'running', memory: '12 MB', uptime: `${h}h ${m.toString().padStart(2, '0')}m`, connector: 'sheets' },
    { id: 'AGT-0x9e55', name: 'Slack Release Broadcast', codename: '#releases', status: telemetry.totalRuns > 0 && telemetry.successCount < telemetry.totalRuns ? 'retrying' : 'running', memory: '24 MB', uptime: `0h ${Math.min(m + 8, 59).toString().padStart(2, '0')}m`, connector: 'slack' }
  ];
  res.json({ total: agents.length, agents });
});

// ─── Audit Log ────────────────────────────────────────────────────────────────
const auditLog = [];
function addAuditEvent(type, message, result = 'SUCCESS') {
  const now = new Date();
  const t = now.toTimeString().slice(0, 8);
  auditLog.unshift({ time: t, type, message, result });
  if (auditLog.length > 50) auditLog.pop();
}
addAuditEvent('Auth', 'System initialized — gateway online', 'SUCCESS');

app.get('/api/audit/events', (req, res) => {
  res.json({ events: auditLog });
});

app.locals.addAuditEvent = addAuditEvent;

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────
app.get('/api/auth/github/status', (req, res) => {
  const token = req.session.githubToken || getSecret('GITHUB_TOKEN');
  res.json({
    connected: Boolean(token),
    login: req.session.githubLogin || null,
    repo: req.session.githubRepoFullName || null
  });
});

app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('Missing GITHUB_CLIENT_ID');
  }
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || `${oauthCallbackBaseUrl()}/auth/github/callback`;
  const scope = process.env.GITHUB_OAUTH_SCOPE || 'repo read:user';
  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  res.redirect(url);
});

app.get('/auth/github/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/?github=error');
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || `${oauthCallbackBaseUrl()}/auth/github/callback`;
  if (!clientId || !clientSecret) {
    return res.redirect('/?github=config');
  }
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.error || !tokenJson.access_token) {
      console.error('GitHub OAuth token error:', tokenJson);
      return res.redirect('/?github=error');
    }
    req.session.githubToken = tokenJson.access_token;

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenJson.access_token}`
      }
    });
    const user = await userRes.json();
    if (user.login) {
      req.session.githubLogin = user.login;
    }

    req.session.save((err) => {
      if (err) console.error(err);
      res.redirect('/?github=connected');
    });
  } catch (e) {
    console.error(e);
    res.redirect('/?github=error');
  }
});

app.get('/api/github/repos', async (req, res) => {
  const token = req.session.githubToken || getSecret('GITHUB_TOKEN');
  if (!token) {
    return res.status(401).json({ error: 'GitHub not connected' });
  }
  try {
    const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`
      }
    });
    const list = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: list.message || 'Failed to list repos' });
    }
    const repos = (Array.isArray(list) ? list : []).map((repo) => ({
      full_name: repo.full_name,
      name: repo.name,
      default_branch: repo.default_branch,
      private: repo.private
    }));
    res.json({ repos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/github/repo', (req, res) => {
  const fullName = (req.body && req.body.fullName) || (req.body && req.body.full_name);
  if (!fullName || typeof fullName !== 'string') {
    return res.status(400).json({ error: "Missing 'fullName'" });
  }
  req.session.githubRepoFullName = fullName.trim();
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, fullName: req.session.githubRepoFullName });
  });
});

// ─── Evolution: Optimize Workflow ─────────────────────────────────────────────
app.post('/api/optimize', async (req, res) => {
  const { steps } = req.body;
  if (!steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: "Missing or invalid 'steps' array" });
  }
  try {
    const result = optimizeWorkflow(steps);
    res.json(result);
  } catch (err) {
    console.error('Optimize error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Evolution: Execution History ─────────────────────────────────────────────
app.get('/api/evolution/history', (req, res) => {
  try {
    const fs = require('fs');
    const filePath = require('path').join(__dirname, 'memory', 'workflows.json');
    if (!fs.existsSync(filePath)) {
      return res.json({ total: 0, workflows: [] });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ total: data.length, workflows: data.slice(-20).reverse() });
  } catch (err) {
    res.json({ total: 0, workflows: [], error: err.message });
  }
});

/**
 * Combined Parse & Execute (with evolution recording)
 */
app.post('/run', async (req, res) => {
  const { text, previousContext, completedSteps } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing 'text' field" });
  }

  const startTime = Date.now();
  telemetry.totalRuns++;
  addAuditEvent('Exec', `Workflow initialized: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`, 'TRIGGER');

  try {
    let steps = await parseWorkflow(text);

    // Apply evolution optimizations from past executions
    const optimized = optimizeWorkflow(steps);
    if (optimized.insights.optimized) {
      steps = optimized.optimizedWorkflow;
      console.log('[Evolution] Optimizations applied:', optimized.insights.improvements.join(', '));
    }

    const result = await runContext(req, async () => {
      const executor = new Executor();
      return executor.execute(steps, previousContext || {}, completedSteps || []);
    });

    const elapsed = Date.now() - startTime;
    telemetry.totalExecutionMs += elapsed;

    if (result.status === 'completed') {
      telemetry.successCount++;
      addAuditEvent('Run', `Workflow completed in ${elapsed}ms — ${steps.length} steps`, 'SUCCESS');
    } else {
      addAuditEvent('Run', `Workflow ended with status: ${result.status}`, 'WARN');
    }

    // Record execution for evolution learning
    recordExecution(null, {
      steps,
      executionMs: elapsed,
      status: result.status
    });

    res.json({
      original_text: text,
      steps,
      executionMs: elapsed,
      evolution: optimized.insights,
      ...result
    });
  } catch (error) {
    console.error('Run error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Parse Natural Language → Steps (ONLY parsing, with optional optimization)
 */
app.post('/parse', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing 'text' field" });
  }

  try {
    const steps = await parseWorkflow(text);

    // Also return optimization insights if available
    const optimized = optimizeWorkflow(steps);

    res.json({
      original_text: text,
      steps,
      evolution: optimized.insights
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Execute Steps (with evolution support)
 */
app.post('/execute', async (req, res) => {
  const { steps, previousContext, completedSteps } = req.body;

  if (!steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: "Invalid or missing 'steps' array" });
  }

  if (!steps.every((step) => step.action)) {
    return res.status(400).json({ error: "Each step must have an 'action'" });
  }

  try {
    const result = await runContext(req, async () => {
      const executor = new Executor();
      return executor.execute(steps, previousContext || {}, completedSteps || []);
    });

    // Record for evolution
    recordExecution(null, {
      steps,
      executionMs: 0,
      status: result.status
    });

    res.json(result);
  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static('frontend'));

/**
 * 🔥 Robust server start (auto port fallback)
 */
const startServer = (port) => {
  const p = Math.min(65535, Math.max(1, parseInt(String(port), 10) || DEFAULT_PORT));
  const server = app.listen(p, () => {
    console.log(`================================================`);
    console.log(`🚀 MCP Gateway running on http://localhost:${p}`);
    console.log(`================================================`);
    console.log(`Try opening: http://localhost:${p}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const next = p + 1;
      if (next > 65535) {
        console.error('No free port in range');
        process.exit(1);
      }
      console.log(`⚠️ Port ${p} busy, trying ${next}...`);
      startServer(next);
    } else {
      console.error('Server error:', err);
    }
  });
};

if (process.env.NODE_ENV !== 'production') {
  app.get('/test/slack', async (req, res) => {
    try {
      if (!process.env.SLACK_WEBHOOK_URL) {
        return res.send('Webhook not set ❌');
      }

      const slackBody = { text: '🚀 Slack working from backend!' };
      const ch = (process.env.SLACK_CHANNEL || '').trim();
      if (ch) {
        slackBody.channel = ch.startsWith('#') || ch.startsWith('C') ? ch : `#${ch}`;
      }
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackBody)
      });

      res.send('Slack sent ✅');
    } catch (err) {
      console.error(err);
      res.send('Error ❌');
    }
  });
}

// Start server
startServer(process.env.PORT || DEFAULT_PORT);
