/**
 * MCP Tool Connector — Google Sheets (Mock Implementation)
 *
 * Provides mock Google Sheets API operations following the MCP standard interface.
 * Supported actions:
 *   append_row, read_range, update_cell, create_sheet,
 *   list_sheets, get_sheet_info, delete_row, clear_range
 */

// ── In-memory mock data store ───────────────────────────────────────────────

const spreadsheets = {
  "spr-001": {
    spreadsheet_id: "spr-001",
    title: "Sprint Tracker",
    owner: "alice@example.com",
    sheets: {
      Tasks: {
        headers: ["ID", "Title", "Assignee", "Status", "Points"],
        rows: [
          ["BUG-101", "Critical bug in payment flow", "alice@example.com", "In Progress", "8"],
          ["BUG-102", "Fix pagination bug", "charlie@example.com", "Open", "3"],
          ["BUG-103", "Dark-mode support", "alice@example.com", "Done", "5"],
        ],
      },
      Summary: {
        headers: ["Metric", "Value"],
        rows: [
          ["Total Stories", "3"],
          ["Completed", "1"],
          ["Total Points", "16"],
        ],
      },
    },
    created_at: "2026-03-01T08:00:00Z",
    updated_at: "2026-04-09T12:00:00Z",
  },
  "spr-002": {
    spreadsheet_id: "spr-002",
    title: "Incident Log",
    owner: "bob@example.com",
    sheets: {
      Log: {
        headers: ["Date", "Severity", "Service", "Summary", "Resolved"],
        rows: [
          ["2026-04-01", "P1", "payments-api", "Timeout on checkout", "Yes"],
          ["2026-04-05", "P2", "auth-service", "Token refresh failure", "Yes"],
        ],
      },
    },
    created_at: "2026-02-15T10:00:00Z",
    updated_at: "2026-04-05T16:30:00Z",
  },
};

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
  console.log(`[sheets_tool] action="${action}" input=${JSON.stringify(input)}`);
}

function getSheet(spreadsheetId, sheetName) {
  const spr = spreadsheets[spreadsheetId];
  if (!spr) return { spr: null, sheet: null, error: `Spreadsheet '${spreadsheetId}' not found` };
  const sheet = spr.sheets[sheetName];
  if (!sheet) return { spr, sheet: null, error: `Sheet '${sheetName}' not found in '${spr.title}'` };
  return { spr, sheet, error: null };
}

// ── Action handlers ─────────────────────────────────────────────────────────

function appendRow(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name || "Tasks";
  const values = input.row || input.values;
  if (!values || !Array.isArray(values)) {
    return err("Missing or invalid parameter: row (must be an array)");
  }

  const { spr, sheet, error } = getSheet(sid, sname);
  if (error) return err(error);

  sheet.rows.push(values.map(String));
  spr.updated_at = nowISO();
  const rowIndex = sheet.rows.length;

  return ok({ row: values, spreadsheet_id: sid, sheet: sname, row_index: rowIndex, status: "added" });
}

function readRange(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name || "Tasks";
  const { spr, sheet, error } = getSheet(sid, sname);
  if (error) return err(error);

  const start = input.start_row || 0;
  const end = input.end_row || sheet.rows.length;
  const rows = sheet.rows.slice(start, end);

  return ok({ spreadsheet_id: sid, sheet: sname, headers: sheet.headers, rows, total_rows: sheet.rows.length });
}

function updateCell(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name || "Tasks";
  const { row, col, value } = input;
  if (row === undefined || col === undefined || value === undefined) {
    return err("Missing required parameters: row, col, value");
  }

  const { spr, sheet, error } = getSheet(sid, sname);
  if (error) return err(error);
  if (row < 0 || row >= sheet.rows.length) return err(`Row ${row} out of range (0-${sheet.rows.length - 1})`);
  if (col < 0 || col >= sheet.headers.length) return err(`Col ${col} out of range (0-${sheet.headers.length - 1})`);

  const oldValue = sheet.rows[row][col];
  sheet.rows[row][col] = String(value);
  spr.updated_at = nowISO();

  return ok({
    spreadsheet_id: sid,
    sheet: sname,
    row,
    col,
    column_name: sheet.headers[col],
    old_value: oldValue,
    new_value: String(value),
  });
}

function createSheet(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name;
  if (!sname) return err("Missing required parameter: sheet_name");

  const spr = spreadsheets[sid];
  if (!spr) return err(`Spreadsheet '${sid}' not found`);
  if (spr.sheets[sname]) return err(`Sheet '${sname}' already exists`);

  const headers = input.headers || ["Column A", "Column B", "Column C"];
  spr.sheets[sname] = { headers, rows: [] };
  spr.updated_at = nowISO();

  return ok({ spreadsheet_id: sid, sheet: sname, headers, created: true });
}

function listSheets(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const spr = spreadsheets[sid];
  if (!spr) return err(`Spreadsheet '${sid}' not found`);

  const sheetsInfo = Object.entries(spr.sheets).map(([name, s]) => ({
    name,
    row_count: s.rows.length,
    col_count: s.headers.length,
  }));

  return ok({ spreadsheet_id: sid, title: spr.title, sheets: sheetsInfo });
}

function getSheetInfo(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const spr = spreadsheets[sid];
  if (!spr) return err(`Spreadsheet '${sid}' not found`);

  const { sheets, ...info } = spr;
  info.sheet_names = Object.keys(sheets);
  return ok({ ...info });
}

function deleteRow(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name || "Tasks";
  const { row } = input;
  if (row === undefined) return err("Missing required parameter: row");

  const { spr, sheet, error } = getSheet(sid, sname);
  if (error) return err(error);
  if (row < 0 || row >= sheet.rows.length) return err(`Row ${row} out of range (0-${sheet.rows.length - 1})`);

  const removed = sheet.rows.splice(row, 1)[0];
  spr.updated_at = nowISO();

  return ok({ spreadsheet_id: sid, sheet: sname, deleted_row: row, values: removed, remaining_rows: sheet.rows.length });
}

function clearRange(input) {
  const sid = input.spreadsheet_id || "spr-001";
  const sname = input.sheet_name || "Tasks";
  const { spr, sheet, error } = getSheet(sid, sname);
  if (error) return err(error);

  const count = sheet.rows.length;
  sheet.rows = [];
  spr.updated_at = nowISO();

  return ok({ spreadsheet_id: sid, sheet: sname, cleared_rows: count });
}

// ── Action routing table ────────────────────────────────────────────────────

const actions = {
  append_row: appendRow,
  read_range: readRange,
  update_cell: updateCell,
  create_sheet: createSheet,
  list_sheets: listSheets,
  get_sheet_info: getSheetInfo,
  delete_row: deleteRow,
  clear_range: clearRange,
};

// ── Public MCP interface ────────────────────────────────────────────────────

module.exports = {
  /**
   * MCP standard entry-point for the Google Sheets tool.
   * @param {string} action - The action to perform.
   * @param {object} input  - Action-specific parameters.
   * @returns {Promise<object>} Standard MCP response envelope.
   */
  execute: async (action, input = {}) => {
    log(action, input);

    const handler = actions[action];
    if (!handler) {
      const msg = `Unknown action '${action}'. Available: ${Object.keys(actions).join(", ")}`;
      console.warn(`[sheets_tool] ${msg}`);
      return err(msg);
    }

    try {
      return handler(input);
    } catch (e) {
      console.error(`[sheets_tool] Error in '${action}':`, e.message);
      return err(`Internal error: ${e.message}`);
    }
  },
};
