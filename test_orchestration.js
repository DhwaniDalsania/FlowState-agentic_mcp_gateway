const http = require('http');

const postData = JSON.stringify({
  text: `You are an automation agent. Execute steps strictly in this order:

1. Notion (FIRST)
2. GitHub
3. Google Sheets
4. Slack (FINAL)

Do NOT reorder steps.

Step 1: Notion
- Create tasks in Notion database
- Output:
  - task list
  - taskCount

Step 2: GitHub (only after Step 1)
- Create a new branch
- Branch name should reflect tasks
- Output:
  - repo
  - branch

Step 3: Google Sheets (only after Step 2)
- Log execution:
  - repo
  - branch
  - taskCount
  - timestamp

Step 4: Slack (ONLY LAST STEP)
- Send completion message:
  "✅ Workflow Completed
   📌 Tasks Created: {taskCount}
   🌿 Branch: {branch}
   📊 Logged in Sheets"`
});

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/run',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('Result Status:', data.status);
      console.log('Steps Order:');
      data.steps.forEach(s => console.log(`- ${s.name} (depends on: ${s.depends_on})`));
      console.log('Logs:');
      data.logs.forEach(l => console.log(l));
    } catch (e) {
      console.error('Failed to parse response. Raw body:');
      console.error(body);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
