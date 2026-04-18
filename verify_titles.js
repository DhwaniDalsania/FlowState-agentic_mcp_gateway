const { parseWorkflow } = require('./parser');

async function test(text) {
  console.log(`\nInput: "${text}"`);
  try {
    const result = await parseWorkflow(text);
    console.log('Parsed result:', JSON.stringify(result, null, 2));
    
    const notionStep = result.steps.find(s => s.connector === 'notion');
    const githubStep = result.steps.find(s => s.connector === 'github');
    
    if (notionStep) console.log('Notion Tasks:', notionStep.input.tasks);
    if (githubStep) console.log('GitHub Branch:', githubStep.input.branch_name);
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

async function runTests() {
  // Ensure fallback is used for CLI tests if no API key
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || ''; 
  
  await test('Create a task in Notion titled "Add user authentication"');
  await test('Create a task named Fix login bug');
  await test('Open a branch called feature/auth');
  await test('Send a message');
}

runTests().catch(console.error);
