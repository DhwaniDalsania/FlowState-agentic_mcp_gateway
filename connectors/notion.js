/**
 * Notion Connector — NOTION_API_KEY / NOTION_TOKEN, NOTION_DATABASE_ID
 * Properties: Task (title), Status (select), Created (date)
 */

const { getSecret } = require('../vault');

const ALLOWED_ACTIONS = ['fetch_page', 'update_page', 'create_page', 'create_database_items'];

function getNotionKey() {
  return getSecret('NOTION_API_KEY') || getSecret('NOTION_TOKEN') || '';
}

function getDatabaseId() {
  return getSecret('NOTION_DATABASE_ID') || '';
}

async function notionFetch(path, options = {}) {
  const key = getNotionKey();
  if (!key) {
    throw new Error('Missing NOTION_API_KEY (or NOTION_TOKEN)');
  }
  const url = path.startsWith('http') ? path : `https://api.notion.com/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
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
    const msg = data.message || res.error || res.statusText || 'Notion API error';
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

function buildPageBody(taskTitle) {
  const start = new Date().toISOString();
  return {
    parent: { database_id: getDatabaseId() },
    properties: {
      Task: {
        title: [{ type: 'text', text: { content: String(taskTitle).slice(0, 2000) } }]
      },
      Status: {
        select: { name: process.env.NOTION_STATUS_OPTION || 'To Do' }
      },
      Created: {
        date: { start }
      }
    }
  };
}

async function execute(action, data) {
  console.log(`[Notion Connector] Executing ${action}...`);

  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Unauthorized action: ${action} for Notion`);
  }

  switch (action) {
    case 'fetch_page':
      return {
        id: data.pageId || 'notion-page-123',
        title: 'Fix critical production bug',
        status: 'Open',
        priority: 'High'
      };
    case 'update_page':
      return {
        id: data.pageId,
        status: 'In Progress',
        message: 'Page updated successfully'
      };
    case 'create_page':
      return { success: true };
    case 'create_database_items': {
      const db = getDatabaseId();
      if (!db) {
        throw new Error('Missing NOTION_DATABASE_ID');
      }
      const tasks = (data && data.tasks) || [];
      if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('create_database_items requires non-empty tasks array');
      }
      const pageIds = [];
      const timestamp = new Date().toISOString();
      for (const t of tasks) {
        const body = buildPageBody(t);
        const page = await notionFetch('/pages', { method: 'POST', body: JSON.stringify(body) });
        if (page.id) pageIds.push(page.id);
      }
      return {
        taskCount: tasks.length,
        taskList: tasks,
        pageIds,
        status: 'OK',
        timestamp
      };
    }
    default:
      return { success: true };
  }
}

module.exports = { execute };
