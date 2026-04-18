const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, 'memory');
const WORKFLOWS_FILE = path.join(MEMORY_DIR, 'workflows.json');

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

if (!fs.existsSync(WORKFLOWS_FILE)) {
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify([]));
}

function loadWorkflows() {
  try {
    const data = fs.readFileSync(WORKFLOWS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveWorkflows(workflows) {
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2));
}

function recordExecution(workflow_id, executionData) {
  const workflows = loadWorkflows();

  workflows.push({
    workflow_id: workflow_id || Math.random().toString(36).slice(2, 10),
    steps: executionData.steps.map(s => ({
      id: s.id,
      action: s.action,
      connector: s.connector,
      success: s.status === 'OK' || s.success,
      attempts: s.attempts || 1
    })),
    execution_time: executionData.executionMs,
    success: executionData.status === 'completed',
    timestamp: Date.now()
  });

  if (workflows.length > 100) workflows.shift();
  saveWorkflows(workflows);
}

function optimizeWorkflow(currentWorkflow) {
  const pastWorkflows = loadWorkflows();
  let optimized = false;
  let improvements = [];

  const workflow = JSON.parse(JSON.stringify(currentWorkflow));

  workflow.forEach(step => {
    const pastExecutions = pastWorkflows.flatMap(w => w.steps.filter(s => s.action === step.action));

    if (pastExecutions.length > 0) {
      const stable = pastExecutions.every(s => s.success && s.attempts <= 1);
      if (stable) {
        step.max_retries = 0;
        if (!improvements.includes(`Reduced retries for stable step (${step.action})`)) {
          improvements.push(`Reduced retries for stable step (${step.action})`);
          optimized = true;
        }
      }
    }
  });

  const depsCounts = {};
  workflow.forEach(step => {
    const dKey = (step.depends_on || []).sort().join(',');
    depsCounts[dKey] = (depsCounts[dKey] || []).concat(step.id);
  });

  Object.values(depsCounts).forEach(group => {
    if (group.length > 1) {
      improvements.push(`Steps ${group.join(' and ')} can execute in parallel`);
      optimized = true;
    }
  });

  // Auto-add missing steps based on frequent patterns
  const currentSequence = workflow.map(s => s.connector).join(',');
  if (currentSequence) {
    const patterns = {};
    pastWorkflows.forEach(pw => {
      const pwSeq = pw.steps.map(s => s.connector).join(',');
      if (pwSeq.startsWith(currentSequence) && pwSeq.length > currentSequence.length) {
        const remaining = pw.steps.slice(workflow.length);
        if (remaining.length > 0) {
          const nextStep = remaining[0];
          if (nextStep.connector) {
            const pKey = nextStep.connector + ":" + nextStep.action;
            patterns[pKey] = (patterns[pKey] || 0) + 1;
          }
        }
      }
    });
    let bestMatch = null;
    let maxCount = 0;
    for (const [key, count] of Object.entries(patterns)) {
      if (count > maxCount) {
        maxCount = count;
        bestMatch = key;
      }
    }

    if (bestMatch && maxCount >= 1) {
      const [connector, action] = bestMatch.split(':');

      const maxIdInWorkflow = Math.max(...workflow.map(s => s.id), 0);
      const newId = maxIdInWorkflow + 1;

      const defaultInput = (connector === 'notion' && action === 'create_database_items') 
        ? { tasks: ['Automated follow-up task'] } 
        : {};

      workflow.push({
        id: newId,
        name: `Auto-added ${connector} step`,
        connector: connector,
        action: action,
        depends_on: maxIdInWorkflow > 0 ? [maxIdInWorkflow] : [],
        input: defaultInput,
        auto_added: true
      });

      improvements.push(`Auto-added predicted next step: ${connector} (${action})`);
      optimized = true;
    }
  }

  return {
    optimizedWorkflow: workflow,
    insights: {
      optimized: optimized,
      improvements: improvements.length > 0 ? Array.from(new Set(improvements)) : ["Workflow analyzed, no immediate optimizations needed."]
    }
  };
}

module.exports = {
  recordExecution,
  optimizeWorkflow
};
