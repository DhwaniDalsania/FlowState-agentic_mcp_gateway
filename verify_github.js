const githubTool = require('./backend/tools/github_tool');

async function test() {
  console.log('--- Testing Create Branch (Unique) ---');
  const res1 = await githubTool.execute('create_branch', {});
  console.log('Result 1:', JSON.stringify(res1, null, 2));

  const branchName = res1.data.branch;
  console.log(`\n--- Testing Create Existing Branch (${branchName}) ---`);
  const res2 = await githubTool.execute('create_branch', { branch_name: branchName });
  console.log('Result 2:', JSON.stringify(res2, null, 2));

  console.log('\n--- Testing with branch_name field ---');
  const res3 = await githubTool.execute('create_branch', { branch_name: 'test-manual-branch' });
  console.log('Result 3:', JSON.stringify(res3, null, 2));
}

test().catch(console.error);
