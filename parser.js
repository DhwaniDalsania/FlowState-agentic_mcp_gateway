const Groq = require('groq-sdk');
const { getSecret } = require('./vault');

function splitIntoTasks(text) {
  const t = String(text || '').trim();
  if (!t) return ['Untitled task'];
  const tasks = t.split(/\s+and\s+|\s*,\s*|\s*;\s*|\n+|\s*&\s+/i).map(s => s.trim()).filter(Boolean);
  return tasks.length > 0 ? tasks : ['Untitled task'];
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function fallbackWorkflow(text) {
  const taskTitles = splitIntoTasks(text);
  const slug = slugify(text) || 'workflow';
  return [
    { id: 1, name: 'Create Notion Tasks', connector: 'notion', action: 'create_database_items', depends_on: [], input: { tasks: taskTitles } },
    { id: 2, name: 'Create GitHub Branch', connector: 'github', action: 'create_branch', depends_on: [1], input: { branchName: `workflow/${slug}` } },
    { id: 3, name: 'Log to Google Sheets', connector: 'sheets', action: 'append_execution_rows', depends_on: [2], input: { repo: '{{steps[2].output.repo}}', branch: '{{steps[2].output.branch}}', taskCount: '{{steps[1].output.taskCount}}' } },
    { id: 4, name: 'Notify Slack', connector: 'slack', action: 'send_message', depends_on: [3], input: { message: `Workflow Completed\nTasks Created: {{steps[1].output.taskCount}}\nBranch: {{steps[2].output.branch}}\nLogged in Sheets` } }
  ];
}

const SYSTEM_PROMPT = `You are a workflow orchestration engine.
Given a natural language workflow description, output ONLY valid JSON with this exact structure:
{
  "steps": [
    {
      "id": 1,
      "name": "Step Name",
      "service": "notion|github|sheets|slack",
      "action": "create_database_items|create_branch|append_execution_rows|send_message",
      "depends_on": [],
      "input": {}
    }
  ]
}

Input Field Requirements:
- notion (create_database_items): { "tasks": ["Task 1", "Task 2"] }
- github (create_branch): { "branchName": "feature/branch-name" }
- sheets (append_execution_rows): { "repo": "{{steps[ID].output.repo}}", "branch": "{{steps[ID].output.branch}}", "taskCount": "{{steps[ID].output.taskCount}}" }
- slack (send_message): { "message": "The workflow has completed..." }

Rules:
1. Use ONLY services: notion, github, sheets, slack.
2. Output ONLY the JSON object.
3. NEVER include explanations, markdown, or extra text.
4. If you use a value from a previous step, use the format: {{steps[STEP_ID].output.FIELD}}
5. Default flow: notion -> github -> sheets -> slack.`;

async function tryGroq(groq, model, text) {
  console.log(`[Parser] Trying Groq model: ${model}...`);
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Workflow request: "${text}"` }
    ],
    model: model,
    temperature: 0.1,
    max_tokens: 2048,
    stream: false,
    response_format: { type: "json_object" }
  });

  let content = chatCompletion.choices[0].message.content.trim();
  
  // Strip any formatting if present (though response_format should prevent it)
  content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  
  const parsed = JSON.parse(content);
  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('Invalid steps array in response');
  }
  
  return parsed.steps.map((step, i) => {
    const connector = step.service || step.connector;
    const action = step.action;
    const input = step.input ?? {};
    
    // Safety check for Notion database items
    if (connector === 'notion' && action === 'create_database_items') {
      if (!input.tasks || !Array.isArray(input.tasks) || input.tasks.length === 0) {
        input.tasks = ['Process workflow request'];
      }
    }

    return {
      id: step.id ?? i + 1,
      name: step.name ?? `Step ${i + 1}`,
      connector,
      action,
      depends_on: step.depends_on ?? (i === 0 ? [] : [i]),
      input
    };
  });
}

async function groqWorkflow(text) {
  const apiKey = getSecret('GROQ_API_KEY');
  if (!apiKey) throw new Error('No GROQ_API_KEY available in Vault or Env');
  
  const groq = new Groq({ apiKey });
  const models = ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b'];
  
  for (const model of models) {
    try {
      return await tryGroq(groq, model, text);
    } catch (err) {
      console.warn(`[Parser] Model ${model} failed: ${err.message}`);
      // Continue to next model
    }
  }
  
  console.log('[Parser] All Groq models failed, using fallbackWorkflow safety.');
  return fallbackWorkflow(text);
}

const CONFIDENCE_PROMPT = `You are an intent analysis engine. Respond ONLY with valid JSON:
{"confidence":<0.0-1.0>,"reasoning":"<one sentence>","clarification_needed":<true|false>,"clarification_question":"<question or null>","detected_connectors":["<connector>"],"ambiguities":["<item>"]}
Confidence: 0.9+ clear, <0.65 needs clarification.`;

async function analyzeConfidence(text) {
  const apiKey = getSecret('GROQ_API_KEY');
  if (!apiKey) return ruleBasedConfidence(text);
  
  const groq = new Groq({ apiKey });
  try {
    const res = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: CONFIDENCE_PROMPT },
        { role: 'user', content: `Analyze: "${text}"` }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      response_format: { type: "json_object" }
    });
    return JSON.parse(res.choices[0].message.content.trim());
  } catch (err) {
    console.warn(`[Confidence] Groq failed: ${err.message}`);
    return ruleBasedConfidence(text);
  }
}

function ruleBasedConfidence(text) {
  const lower = text.toLowerCase();
  const keywords = {
    notion: ['notion','task','database','page','ticket','sprint'],
    github: ['github','branch','repo','git','pr','pull request','commit'],
    sheets: ['sheet','spreadsheet','log','google sheet','rows','append'],
    slack: ['slack','notify','message','alert','team','channel','post']
  };
  let matched = 0;
  const detected = [];
  for (const [connector, words] of Object.entries(keywords)) {
    if (words.some(w => lower.includes(w))) { matched++; detected.push(connector); }
  }
  const wordCount = text.trim().split(/\s+/).length;
  let confidence = Math.min(0.50 + matched * 0.10, 0.88);
  if (wordCount < 4) confidence = Math.min(confidence, 0.40);
  return {
    confidence: Math.round(confidence * 100) / 100,
    reasoning: matched > 0 ? `Detected ${matched} connector keyword(s): ${detected.join(', ')}` : 'No specific connector keywords found',
    clarification_needed: confidence < 0.65,
    clarification_question: confidence < 0.65 ? 'Could you clarify which tools you want to use?' : null,
    detected_connectors: detected,
    ambiguities: matched < 2 ? ['Connector targets not fully specified'] : []
  };
}

async function parseWorkflow(text) {
  console.log(`[Parser] Parsing workflow with Groq: "${text.slice(0, 80)}..."`);
  return await groqWorkflow(text);
}

module.exports = { parseWorkflow, analyzeConfidence };
