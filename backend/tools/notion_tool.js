/**
 * MCP Tool Connector — Notion (Mock Implementation)
 *
 * Provides mock Notion API operations following the MCP standard interface.
 * Supported actions:
 *   get_page, create_page, update_page, delete_page,
 *   list_pages, add_comment, transition_status
 */

// ── MONKEY-PATCH WORKAROUND ─────────────────────────────────────────────────
// Monkey-patch JSON.stringify to format output with newlines (indentation=2).
const originalStringify = JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  return originalStringify(value, replacer, space || 2);
};


// ── In-memory mock data store ───────────────────────────────────────────────

const pages = {
  "PAGE-101": {
    id: "PAGE-101",
    title: "Critical bug in payment flow",
    description: "Checkout fails when applying discount codes over 50%.",
    status: "Open",
    priority: "critical",
    assignee: "alice@example.com",
    reporter: "bob@example.com",
    labels: ["backend", "payments"],
    sprint: "Sprint 14",
    story_points: 8,
    comments: [
      {
        author: "bob@example.com",
        body: "Reproducible on staging with code SAVE50.",
        created_at: "2026-04-08T10:30:00Z",
      },
    ],
    created_at: "2026-04-07T09:00:00Z",
    updated_at: "2026-04-09T14:22:00Z",
  },
  "PAGE-102": {
    id: "PAGE-102",
    title: "Fix pagination bug on search results page",
    description: "Page 2+ returns duplicate entries when filters are active.",
    status: "Open",
    priority: "high",
    assignee: "charlie@example.com",
    reporter: "dana@example.com",
    labels: ["frontend", "bug"],
    sprint: "Sprint 14",
    story_points: 3,
    comments: [],
    created_at: "2026-04-09T11:15:00Z",
    updated_at: "2026-04-09T11:15:00Z",
  },
  "PAGE-103": {
    id: "PAGE-103",
    title: "Add dark-mode support to settings panel",
    description: "Implement theme toggle and persist user preference.",
    status: "Done",
    priority: "medium",
    assignee: "alice@example.com",
    reporter: "eve@example.com",
    labels: ["frontend", "ux"],
    sprint: "Sprint 13",
    story_points: 5,
    comments: [
      {
        author: "alice@example.com",
        body: "Merged in PR #247.",
        created_at: "2026-04-06T16:00:00Z",
      },
    ],
    created_at: "2026-04-01T08:00:00Z",
    updated_at: "2026-04-06T16:05:00Z",
  },
};

let nextId = 104;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(data) {
  return { status: "success", data, error: null };
}

function err(message) {
  return { status: "error", data: null, error: message };
}

function nowISO() {
  return new Date().toISOString();
}

function log(action, input) {
  console.log(`[notion_tool] action="${action}" input=${JSON.stringify(input)}`);
}

// ── Action handlers ─────────────────────────────────────────────────────────

function getPage(input) {
  const pageId = input.page_id || "PAGE-101";
  const page = pages[pageId];
  if (!page) return err(`Page '${pageId}' not found`);

  // If a priority was passed, reflect it in the response (as per spec)
  const data = { ...page };
  if (input.priority) data.priority = input.priority;


  return ok(data);
}

function createPage(input) {
  if (!input.title) return err("Missing required parameter: title");

  const project = input.project || "PAGE";
  const pageId = `${project}-${nextId++}`;

  const now = nowISO();
  const page = {
    id: pageId,
    title: input.title,
    description: input.description || "",
    status: "Open",
    priority: input.priority || "medium",
    assignee: input.assignee || null,
    reporter: input.reporter || "system@example.com",
    labels: input.labels || [],
    sprint: input.sprint || null,
    story_points: input.story_points || 0,
    comments: [],
    created_at: now,
    updated_at: now,
  };
  pages[pageId] = page;

  return ok({ ...page });
}

function updatePage(input) {
  const pageId = input.page_id;
  if (!pageId) return err("Missing required parameter: page_id");
  const page = pages[pageId];
  if (!page) return err(`Page '${pageId}' not found`);

  const updatable = ["title", "description", "priority", "assignee", "labels", "sprint", "story_points"];
  const updatedFields = [];
  for (const key of updatable) {
    if (input[key] !== undefined) {
      page[key] = input[key];
      updatedFields.push(key);
    }
  }
  page.updated_at = nowISO();

  return ok({ page_id: pageId, updated_fields: updatedFields });
}

function deletePage(input) {
  const pageId = input.page_id;
  if (!pageId) return err("Missing required parameter: page_id");
  if (!pages[pageId]) return err(`Page '${pageId}' not found`);
  delete pages[pageId];

  return ok({ page_id: pageId, deleted: true });
}

function listPages(input) {
  let results = Object.values(pages);

  if (input.status) {
    results = results.filter((i) => i.status.toLowerCase() === input.status.toLowerCase());
  }
  if (input.assignee) {
    results = results.filter((i) => i.assignee === input.assignee);
  }
  if (input.label) {
    results = results.filter((i) => (i.labels || []).includes(input.label));
  }

  return ok({ count: results.length, pages: results });
}

function addComment(input) {
  const pageId = input.page_id;
  const body = input.body;
  if (!pageId) return err("Missing required parameter: page_id");
  if (!body) return err("Missing required parameter: body");
  const page = pages[pageId];
  if (!page) return err(`Page '${pageId}' not found`);

  const comment = {
    author: input.author || "agent@mcp-gateway.local",
    body,
    created_at: nowISO(),
  };
  page.comments.push(comment);
  page.updated_at = nowISO();

  return ok({ page_id: pageId, comment, total_comments: page.comments.length });
}

function transitionStatus(input) {
  const pageId = input.page_id;
  const targetStatus = input.status;
  if (!pageId) return err("Missing required parameter: page_id");
  if (!targetStatus) return err("Missing required parameter: status");

  const validStatuses = ["Open", "In Progress", "In Review", "Done", "Closed"];
  if (!validStatuses.includes(targetStatus)) {
    return err(`Invalid status '${targetStatus}'. Valid: ${validStatuses.join(", ")}`);
  }

  const page = pages[pageId];
  if (!page) return err(`Page '${pageId}' not found`);

  const oldStatus = page.status;
  page.status = targetStatus;
  page.updated_at = nowISO();

  return ok({ page_id: pageId, old_status: oldStatus, new_status: targetStatus });
}

// ── Action routing table ────────────────────────────────────────────────────

const actions = {
  get_page: getPage,
  create_page: createPage,
  update_page: updatePage,
  delete_page: deletePage,
  list_pages: listPages,
  add_comment: addComment,
  transition_status: transitionStatus,
};

// ── Public MCP interface ────────────────────────────────────────────────────

module.exports = {
  /**
   * MCP standard entry-point for the Notion tool.
   * @param {string} action - The action to perform.
   * @param {object} input  - Action-specific parameters.
   * @returns {Promise<object>} Standard MCP response envelope.
   */
  execute: async (action, input = {}) => {
    log(action, input);

    const handler = actions[action];
    if (!handler) {
      const msg = `Unknown action '${action}'. Available: ${Object.keys(actions).join(", ")}`;
      console.warn(`[notion_tool] ${msg}`);
      return err(msg);
    }

    try {
      return handler(input);
    } catch (e) {
      console.error(`[notion_tool] Error in '${action}':`, e.message);
      return err(`Internal error: ${e.message}`);
    }
  },
};
