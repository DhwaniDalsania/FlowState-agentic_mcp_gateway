/**
 * Slack Connector — SLACK_WEBHOOK_URL; optional SLACK_CHANNEL (#social, etc.)
 */

const { getSecret } = require('../vault');

const ALLOWED_ACTIONS = ['send_message', 'send_external_message'];

function applySlackChannel(payload) {
  const body = { ...payload };
  const ch = (getSecret('SLACK_CHANNEL') || '').trim();
  if (ch && body.channel == null) {
    body.channel = ch.startsWith('#') || ch.startsWith('C') ? ch : `#${ch}`;
  }
  return body;
}

async function postWebhook(payload) {
  const url = getSecret('SLACK_WEBHOOK_URL');
  if (!url) {
    throw new Error('Missing SLACK_WEBHOOK_URL');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(applySlackChannel(payload))
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${t}`);
  }
}

async function execute(action, data) {
  console.log(`[Slack Connector] Executing ${action}...`);

  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Unauthorized action: ${action} for Slack`);
  }

  const repo = (data && data.repo) != null ? String(data.repo) : '(unknown repo)';
  const branch = (data && data.branch) != null ? String(data.branch) : '(no branch)';
  const taskCount = Number((data && data.taskCount) != null ? data.taskCount : 0);

  const text =
    (data && data.message) ||
    [
      '*Workflow executed*',
      `• *Repository:* ${repo}`,
      `• *Branch created:* \`${branch}\``,
      `• *Notion tasks created:* ${Number.isFinite(taskCount) ? taskCount : 0}`
    ].join('\n');

  await postWebhook({ text });

  const timestamp = new Date().toISOString();
  const ch = (getSecret('SLACK_CHANNEL') || '').trim();
  return {
    timestamp,
    channel: data.channel || (ch ? (ch.startsWith('#') ? ch : `#${ch}`) : '#webhook'),
    status: 'Sent'
  };
}

module.exports = { execute };
