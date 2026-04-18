const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, 'memory');
const VAULT_FILE = path.join(MEMORY_DIR, 'vault.json');

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

if (!fs.existsSync(VAULT_FILE)) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify({}));
}

function loadVault() {
  try {
    const data = fs.readFileSync(VAULT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

function saveVault(vaultData) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(vaultData, null, 2));
}

function getSecret(key) {
  const vault = loadVault();
  return vault[key] || process.env[key] || null;
}

function setSecret(key, value) {
  const vault = loadVault();
  vault[key] = value;
  saveVault(vault);
}

function getAllSecretsStatus() {
  const vault = loadVault();
  const keys = ['GITHUB_TOKEN', 'SLACK_WEBHOOK_URL', 'NOTION_API_KEY', 'GOOGLE_SA_JSON', 'NOTION_DATABASE_ID', 'GOOGLE_SHEET_ID', 'GROQ_API_KEY'];
  const secrets = [];
  
  for (const k of keys) {
    const val = vault[k] || process.env[k];
    secrets.push({
      name: k,
      type: k.includes('TOKEN') || k.includes('KEY') ? 'Secret Key' : 'Configuration',
      status: val ? 'active' : 'missing',
      masked: val ? (val.length > 8 ? val.slice(0, 4) + '••••' + val.slice(-4) : '••••••••') : 'missing',
      usedTimes: 0,
      addedDaysAgo: 0
    });
  }
  return secrets;
}

module.exports = {
  getSecret,
  setSecret,
  getAllSecretsStatus
};
