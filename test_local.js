const { parseWorkflow } = require('./parser');
const { run: runContext } = require('./requestContext');
const { Executor } = require('./executor');
require('dotenv').config();

async function test() {
  const text = `You are an automation agent. Execute steps strictly in this order:
1. Notion (FIRST)
2. GitHub
3. Google Sheets
4. Slack (FINAL)`;

  console.log('--- Parsing ---');
  const steps = await parseWorkflow(text);
  console.log('Steps generated:', steps.length);
  steps.forEach(s => console.log(`${s.id}: ${s.name} (${s.connector}). Depends on: ${s.depends_on}`));

  console.log('\n--- Executing ---');
  try {
    const result = await runContext({ session: {} }, async () => {
      const executor = new Executor();
      return executor.execute(steps);
    });
    console.log('\n--- Result ---');
    console.log('Status:', result.status);
    console.log('Logs:');
    result.logs.forEach(l => console.log(l));
  } catch (err) {
    console.error('Execution failed:', err);
  }
}

test();
