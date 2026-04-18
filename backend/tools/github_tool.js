/**
 * MCP Tool Connector — GitHub (Mock Implementation)
 *
 * Provides mock GitHub API operations following the MCP standard interface.
 * Supported actions:
 *   create_branch, delete_branch, list_branches,
 *   create_pr, merge_pr, list_prs,
 *   get_repo_info, create_issue, list_commits
 */

const crypto = require("crypto");

// ── In-memory mock data store ───────────────────────────────────────────────

const repoInfo = {
  owner: "acme-corp",
  repo: "mcp-gateway",
  default_branch: "main",
  visibility: "private",
  language: "JavaScript",
  stars: 42,
  forks: 7,
  open_issues: 3,
  created_at: "2025-11-01T08:00:00Z",
  updated_at: "2026-04-09T18:30:00Z",
};

const branches = {
  main: {
    name: "main",
    sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    protected: true,
    created_at: "2025-11-01T08:00:00Z",
  },
  develop: {
    name: "develop",
    sha: "f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9",
    protected: false,
    created_at: "2025-11-02T10:00:00Z",
  },
  "feature/auth-flow": {
    name: "feature/auth-flow",
    sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    protected: false,
    created_at: "2026-04-07T09:15:00Z",
  },
};

const pullRequests = {
  1: {
    pr_id: 1,
    title: "Add OAuth2 login support",
    description: "Implements the authentication flow using OAuth2.",
    source_branch: "feature/auth-flow",
    target_branch: "develop",
    status: "open",
    author: "alice",
    reviewers: ["bob", "charlie"],
    labels: ["enhancement", "backend"],
    created_at: "2026-04-08T12:00:00Z",
    updated_at: "2026-04-09T09:30:00Z",
  },
};

const commits = [
  {
    sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    message: "Initial commit — project scaffold",
    author: "bob",
    branch: "main",
    created_at: "2025-11-01T08:00:00Z",
  },
  {
    sha: "f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9",
    message: "Setup CI/CD pipeline with GitHub Actions",
    author: "charlie",
    branch: "main",
    created_at: "2025-11-05T14:20:00Z",
  },
  {
    sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    message: "feat: add JWT token generation",
    author: "alice",
    branch: "feature/auth-flow",
    created_at: "2026-04-07T10:30:00Z",
  },
];

const ghIssues = [
  {
    issue_number: 1,
    title: "Pagination returns duplicates",
    body: "When filters are active, page 2+ shows duplicates.",
    state: "open",
    labels: ["bug"],
    assignee: "charlie",
    created_at: "2026-04-09T11:00:00Z",
  },
];

let nextPrId = 2;
let nextIssueNumber = 2;

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

function fakeSha(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex");
}

function log(action, input) {
  console.log(`[github_tool] action="${action}" input=${JSON.stringify(input)}`);
}

// ── Action handlers ─────────────────────────────────────────────────────────

function createBranch(input) {
  const branchName = input.branch_name;
  const source = input.source || "main";
  if (!branchName) return err("Missing required parameter: branch_name");
  if (branches[branchName]) return err(`Branch '${branchName}' already exists`);
  if (!branches[source]) return err(`Source branch '${source}' not found`);

  const sha = fakeSha(`${branchName}-${nowISO()}`);
  branches[branchName] = {
    name: branchName,
    sha,
    protected: false,
    created_at: nowISO(),
  };

  return ok({ branch: branchName, source, sha, status: "created" });
}

function deleteBranch(input) {
  const branchName = input.branch_name;
  if (!branchName) return err("Missing required parameter: branch_name");
  const branch = branches[branchName];
  if (!branch) return err(`Branch '${branchName}' not found`);
  if (branch.protected) return err(`Cannot delete protected branch '${branchName}'`);
  delete branches[branchName];

  return ok({ branch: branchName, deleted: true });
}

function listBranches() {
  const list = Object.values(branches);
  return ok({ count: list.length, branches: list });
}

function createPr(input) {
  const { title, source_branch, target_branch = "develop" } = input;
  if (!title) return err("Missing required parameter: title");
  if (!source_branch) return err("Missing required parameter: source_branch");
  if (!branches[source_branch]) return err(`Source branch '${source_branch}' not found`);
  if (!branches[target_branch]) return err(`Target branch '${target_branch}' not found`);

  const prId = nextPrId++;
  const now = nowISO();
  const pr = {
    pr_id: prId,
    title,
    description: input.description || "",
    source_branch,
    target_branch,
    status: "open",
    author: input.author || "agent",
    reviewers: input.reviewers || [],
    labels: input.labels || [],
    created_at: now,
    updated_at: now,
  };
  pullRequests[prId] = pr;

  return ok({ ...pr });
}

function mergePr(input) {
  const prId = input.pr_id;
  if (prId === undefined) return err("Missing required parameter: pr_id");
  const pr = pullRequests[Number(prId)];
  if (!pr) return err(`Pull request #${prId} not found`);
  if (pr.status !== "open") return err(`PR #${prId} is already ${pr.status}`);

  const mergeSha = fakeSha(`merge-${prId}-${nowISO()}`);
  pr.status = "merged";
  pr.updated_at = nowISO();
  commits.push({
    sha: mergeSha,
    message: `Merge PR #${prId}: ${pr.title}`,
    author: "github-merge-bot",
    branch: pr.target_branch,
    created_at: nowISO(),
  });

  return ok({ pr_id: prId, merged: true, merge_sha: mergeSha, target_branch: pr.target_branch });
}

function listPrs(input) {
  let prs = Object.values(pullRequests);
  if (input.status) {
    prs = prs.filter((p) => p.status === input.status);
  }
  return ok({ count: prs.length, pull_requests: prs });
}

function getRepoInfo() {
  return ok({ ...repoInfo });
}

function createIssue(input) {
  if (!input.title) return err("Missing required parameter: title");
  const issueNumber = nextIssueNumber++;
  const issue = {
    issue_number: issueNumber,
    title: input.title,
    body: input.body || "",
    state: "open",
    labels: input.labels || [],
    assignee: input.assignee || null,
    created_at: nowISO(),
  };
  ghIssues.push(issue);

  return ok({ ...issue });
}

function listCommits(input) {
  let filtered = [...commits];
  if (input.branch) {
    filtered = filtered.filter((c) => c.branch === input.branch);
  }
  const limit = input.limit || 10;
  filtered = filtered.slice(-limit);
  return ok({ count: filtered.length, commits: filtered });
}

// ── Action routing table ────────────────────────────────────────────────────

const actions = {
  create_branch: createBranch,
  delete_branch: deleteBranch,
  list_branches: listBranches,
  create_pr: createPr,
  merge_pr: mergePr,
  list_prs: listPrs,
  get_repo_info: getRepoInfo,
  create_issue: createIssue,
  list_commits: listCommits,
};

// ── Public MCP interface ────────────────────────────────────────────────────

module.exports = {
  /**
   * MCP standard entry-point for the GitHub tool.
   * @param {string} action - The action to perform.
   * @param {object} input  - Action-specific parameters.
   * @returns {Promise<object>} Standard MCP response envelope.
   */
  execute: async (action, input = {}) => {
    log(action, input);

    const handler = actions[action];
    if (!handler) {
      const msg = `Unknown action '${action}'. Available: ${Object.keys(actions).join(", ")}`;
      console.warn(`[github_tool] ${msg}`);
      return err(msg);
    }

    try {
      return handler(input);
    } catch (e) {
      console.error(`[github_tool] Error in '${action}':`, e.message);
      return err(`Internal error: ${e.message}`);
    }
  },
};
