const { parseWorkflow } = require('./parser');
require('dotenv').config();

async function test() {
  const input = "When a GitHub PR is merged, create a Notion task";
  console.log(`Input: ${input}`);
  try {
    const steps = await parseWorkflow(input);
    console.log(JSON.stringify(steps, null, 2));
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
