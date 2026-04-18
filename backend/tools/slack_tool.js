/**
 * MCP Tool Connector — Slack (Mock Implementation)
 *
 * Provides mock Slack API operations following the MCP standard interface.
 * Supported actions:
 *   send_message, send_dm, list_channels, create_channel,
 *   get_channel_history, add_reaction, set_topic, upload_file
 */

// ── In-memory mock data store ───────────────────────────────────────────────

let msgCounter = 100;

const channels = {
  C001: {
    channel_id: "C001",
    name: "general",
    topic: "Company-wide announcements",
    is_private: false,
    members: ["U001", "U002", "U003", "U004"],
    created_at: "2025-01-10T08:00:00Z",
  },
  C002: {
    channel_id: "C002",
    name: "engineering",
    topic: "Engineering discussions and code reviews",
    is_private: false,
    members: ["U001", "U002", "U003"],
    created_at: "2025-01-10T08:15:00Z",
  },
  C003: {
    channel_id: "C003",
    name: "incidents",
    topic: "Production incident coordination",
    is_private: true,
    members: ["U001", "U003"],
    created_at: "2025-06-20T14:00:00Z",
  },
};

const users = {
  U001: { user_id: "U001", name: "alice", display_name: "Alice M.", status: "online" },
  U002: { user_id: "U002", name: "bob", display_name: "Bob K.", status: "away" },
  U003: { user_id: "U003", name: "charlie", display_name: "Charlie S.", status: "online" },
  U004: { user_id: "U004", name: "dana", display_name: "Dana R.", status: "offline" },
};

const messages = [
  {
    message_id: "msg-001",
    channel_id: "C001",
    user_id: "U001",
    text: "Welcome to the new workspace! 🎉",
    reactions: [{ emoji: "tada", users: ["U002", "U003"] }],
    timestamp: "2025-01-10T08:05:00Z",
  },
  {
    message_id: "msg-002",
    channel_id: "C002",
    user_id: "U003",
    text: "PR #247 is ready for review — dark-mode settings panel.",
    reactions: [],
    timestamp: "2026-04-06T15:50:00Z",
  },
];

let nextChNum = 4;

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

function nextMsgId() {
  return `msg-${++msgCounter}`;
}

function log(action, input) {
  console.log(`[slack_tool] action="${action}" input=${JSON.stringify(input)}`);
}

function resolveChannel(key) {
  if (!key) return null;
  return channels[key] || Object.values(channels).find((c) => c.name === key) || null;
}

function resolveUser(key) {
  if (!key) return null;
  return users[key] || Object.values(users).find((u) => u.name === key) || null;
}

// ── Action handlers ─────────────────────────────────────────────────────────

function sendMessage(input) {
  const channelName = input.channel || "general";
  const ch = resolveChannel(channelName);
  const text = input.message || input.text;
  if (!ch) return err(`Channel '${channelName}' not found`);
  if (!text) return err("Missing required parameter: message");

  const mid = nextMsgId();
  messages.push({
    message_id: mid,
    channel_id: ch.channel_id,
    user_id: input.user_id || "U-BOT",
    text,
    reactions: [],
    timestamp: nowISO(),
  });

  return ok({ message: text, message_id: mid, channel: ch.name, status: "sent", timestamp: nowISO() });
}

function sendDm(input) {
  const u = resolveUser(input.user);
  const text = input.message || input.text;
  if (!u) return err(`User '${input.user}' not found`);
  if (!text) return err("Missing required parameter: message");

  const mid = nextMsgId();
  return ok({ message_id: mid, recipient: u.name, recipient_id: u.user_id, status: "sent", timestamp: nowISO() });
}

function listChannels(input) {
  let chs = Object.values(channels);
  if (!input.include_private) {
    chs = chs.filter((c) => !c.is_private);
  }
  return ok({ count: chs.length, channels: chs });
}

function createChannel(input) {
  if (!input.name) return err("Missing required parameter: name");
  if (Object.values(channels).some((c) => c.name === input.name)) {
    return err(`Channel '${input.name}' already exists`);
  }

  const cid = `C${String(nextChNum++).padStart(3, "0")}`;
  const ch = {
    channel_id: cid,
    name: input.name,
    topic: input.topic || "",
    is_private: input.is_private || false,
    members: input.members || [],
    created_at: nowISO(),
  };
  channels[cid] = ch;

  return ok({ ...ch });
}

function getChannelHistory(input) {
  const ch = resolveChannel(input.channel);
  if (!ch) return err(`Channel '${input.channel}' not found`);
  const limit = input.limit || 25;
  const msgs = messages.filter((m) => m.channel_id === ch.channel_id).slice(-limit);

  return ok({ channel: ch.name, count: msgs.length, messages: msgs });
}

function addReaction(input) {
  const { message_id, emoji, user_id = "U-BOT" } = input;
  if (!message_id) return err("Missing required parameter: message_id");
  if (!emoji) return err("Missing required parameter: emoji");
  const msg = messages.find((m) => m.message_id === message_id);
  if (!msg) return err(`Message '${message_id}' not found`);

  const entry = msg.reactions.find((r) => r.emoji === emoji);
  if (entry) {
    if (!entry.users.includes(user_id)) entry.users.push(user_id);
  } else {
    msg.reactions.push({ emoji, users: [user_id] });
  }

  return ok({ message_id, emoji, reacted: true });
}

function setTopic(input) {
  const ch = resolveChannel(input.channel);
  if (!ch) return err(`Channel '${input.channel}' not found`);
  if (input.topic === undefined) return err("Missing required parameter: topic");

  const oldTopic = ch.topic;
  ch.topic = input.topic;
  return ok({ channel: ch.name, old_topic: oldTopic, new_topic: input.topic });
}

function uploadFile(input) {
  const ch = resolveChannel(input.channel);
  if (!ch) return err(`Channel '${input.channel}' not found`);
  if (!input.filename) return err("Missing required parameter: filename");

  const fileId = `F${String(++msgCounter).padStart(8, "0")}`;
  return ok({
    file_id: fileId,
    filename: input.filename,
    channel: ch.name,
    size_bytes: input.size_bytes || 1024,
    uploaded: true,
    timestamp: nowISO(),
  });
}

// ── Action routing table ────────────────────────────────────────────────────

const actions = {
  send_message: sendMessage,
  send_dm: sendDm,
  list_channels: listChannels,
  create_channel: createChannel,
  get_channel_history: getChannelHistory,
  add_reaction: addReaction,
  set_topic: setTopic,
  upload_file: uploadFile,
};

// ── Public MCP interface ────────────────────────────────────────────────────

module.exports = {
  /**
   * MCP standard entry-point for the Slack tool.
   * @param {string} action - The action to perform.
   * @param {object} input  - Action-specific parameters.
   * @returns {Promise<object>} Standard MCP response envelope.
   */
  execute: async (action, input = {}) => {
    log(action, input);

    const handler = actions[action];
    if (!handler) {
      const msg = `Unknown action '${action}'. Available: ${Object.keys(actions).join(", ")}`;
      console.warn(`[slack_tool] ${msg}`);
      return err(msg);
    }

    try {
      return handler(input);
    } catch (e) {
      console.error(`[slack_tool] Error in '${action}':`, e.message);
      return err(`Internal error: ${e.message}`);
    }
  },
};
