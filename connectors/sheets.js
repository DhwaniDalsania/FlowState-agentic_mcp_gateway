/**
 * Google Sheets — GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS or credentials.json
 * Columns: Task, Status, Timestamp
 */

const path = require('path');
const { google } = require('googleapis');

const { getSecret } = require('../vault');

const ALLOWED_ACTIONS = ['update_sheet', 'read_sheet', 'append_execution_rows'];

function getSheetId() {
  return getSecret('GOOGLE_SHEET_ID') || '';
}

function getRange() {
  return getSecret('GOOGLE_SHEET_RANGE') || 'Sheet1!A:C';
}

async function getSheetsClient() {
  const saJson = getSecret('GOOGLE_SA_JSON');
  let auth;
  if (saJson) {
    try {
      const credentials = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
      if (credentials && credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } catch (e) {
      console.error('[Sheets] Failed to parse GOOGLE_SA_JSON from vault, falling back to keyFile');
    }
  }
  
  if (!auth) {
    const keyFile =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(__dirname, '..', 'credentials.json');
    auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }
  
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function execute(action, data) {
  console.log(`[Google Sheets Connector] Executing ${action}...`);

  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Unauthorized action: ${action} for Sheets`);
  }

  const spreadsheetId = getSheetId();
  if (!spreadsheetId) {
    throw new Error('Missing GOOGLE_SHEET_ID');
  }

  switch (action) {
    case 'read_sheet': {
      const sheets = await getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: getRange()
      });
      return { values: res.data.values || [] };
    }
    case 'append_execution_rows': {
      const repo = (data && data.repo) != null ? String(data.repo) : '';
      const branch = (data && data.branch) != null ? String(data.branch) : '';
      const taskCount = Number((data && data.taskCount) != null ? data.taskCount : 0);
      const slackStatus = (data && data.slackStatus) != null ? String(data.slackStatus) : 'OK';
      const now = () => new Date().toISOString();
      const rows = [
        [`GitHub: create branch \`${branch}\` in ${repo}`, 'OK', now()],
        [`Notion: created ${Number.isFinite(taskCount) ? taskCount : 0} task(s)`, 'OK', now()],
        ['Slack: workflow notification', slackStatus, now()],
        ['Sheets: execution log appended', 'OK', now()]
      ];
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: getRange(),
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows }
      });
      return {
        spreadsheetId,
        updatedRows: rows.length,
        status: 'Success'
      };
    }
    case 'update_sheet':
    default: {
      const sheets = await getSheetsClient();
      const rows = (data && data.rows) || [['Task', 'Status', 'Timestamp']];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: getRange(),
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows }
      });
      return {
        spreadsheetId: data.id || spreadsheetId,
        updatedRows: rows.length,
        status: 'Success'
      };
    }
  }
}

module.exports = { execute };
