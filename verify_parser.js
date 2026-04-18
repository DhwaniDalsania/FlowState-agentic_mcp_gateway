const { parseWorkflow } = require('./parser');

async function test() {
  console.log('--- Testing Parser with New Prompt ---');
  // Mocking the environment for fallback if Groq fails
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'mock-key';
  
  const text = 'Create a notion task and then a github branch called feature-x';
  console.log(`Input: "${text}"`);
  
  try {
    const result = await parseWorkflow(text);
    console.log('Parsed result:', JSON.stringify(result, null, 2));
    
    // Check if branch_name is in input for github step
    const githubStep = result.steps.find(s => s.connector === 'github');
    if (githubStep) {
      console.log('GitHub Step Input:', githubStep.input);
    }
  } catch (err) {
    console.error('Parser failed:', err.message);
  }
}

test().catch(console.error);
