const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const credentialsPath = path.join(__dirname, 'credentials.json');

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const envContent = fs.readFileSync(envPath, 'utf8');

const lines = envContent.split('\n');
const newLines = lines.filter(l => !l.startsWith('GOOGLE_SA_JSON='));

newLines.push(`GOOGLE_SA_JSON='${JSON.stringify(credentials)}'`);

fs.writeFileSync(envPath, newLines.join('\n'));
console.log('Successfully updated .env with minified and correctly escaped GOOGLE_SA_JSON');
