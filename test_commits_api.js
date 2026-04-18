const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function checkCommits() {
  try {
    const res = await fetch('http://localhost:3002/api/git/commits');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

checkCommits();
