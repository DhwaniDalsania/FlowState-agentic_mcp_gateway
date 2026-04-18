/**
 * Execution Engine
 * Handles DAG execution, retries, approvals, and context management.
 */

const notion = require('./connectors/notion');
const github = require('./connectors/github');
const slack = require('./connectors/slack');
const sheets = require('./connectors/sheets');

const connectors = {
  notion,
  github,
  slack,
  sheets
};

class Executor {
  constructor() {
    this.logs = [];
    this.context = {}; // Stores outputs by step ID
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }).toLowerCase();
    this.logs.push("[SYS]");
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    this.logs.push(logEntry);
  }

  async execute(steps, previousContext = {}, completedSteps = []) {
    this.log("Starting workflow execution...");

    this.context = { ...this.context, ...previousContext };
    const executed = new Set(completedSteps);

    const runStep = async (step) => {
      if (executed.has(step.id)) return;

      // 🔥 Run dependencies FIRST
      for (const depId of step.depends_on || []) {
        const depStep = steps.find(s => s.id === depId);
        if (!depStep) {
          throw new Error(`Dependency step ${depId} not found`);
        }
        await runStep(depStep);
      }

      const result = await this.executeStepWithRetry(step);

      if (!result.success) {
        throw new Error(`Step ${step.id} failed`);
      }

      // Save context
      this.context[step.id] = result.output;
      executed.add(step.id);
    };

    try {
      for (const step of steps) {
        if (!executed.has(step.id)) {
          await runStep(step);
        }
      }

      this.log("Workflow completed successfully.");
      return {
        status: 'completed',
        logs: this.logs,
        context: this.context,
        completed_steps: Array.from(executed)
      };

    } catch (error) {
      this.log(`Workflow failed: ${error.message}`);
      return {
        status: 'failed',
        error: error.message,
        logs: this.logs,
        context: this.context,
        completed_steps: Array.from(executed)
      };
    }
  }

  async executeStepWithRetry(step, attempt = 1) {
    this.log(`Executing step ${step.id}: ${step.name} (Attempt ${attempt})`);

    try {
      const connector = connectors[step.connector];
      if (!connector) {
        throw new Error(`Connector ${step.connector} not found`);
      }

      // Simulate parsing context into input (e.g., {{steps[1].output.id}})
      const resolvedInput = this.resolveInput(step.input);

      // Execute action
      const output = await connector.execute(step.action, resolvedInput);

      this.log(`Step ${step.id} succeeded.`);
      step.status = 'OK';
      return { success: true, output };

    } catch (error) {
      this.log(`Step ${step.id} failed: ${error.message}`);
      const maxRetries = step.max_retries !== undefined ? step.max_retries : 2;

      if (attempt <= maxRetries) {
        this.log(`Retrying step ${step.id}...`);
        return await this.executeStepWithRetry(step, attempt + 1);
      }

      step.status = 'FAILED';
      return { success: false, error: error.message };
    }
  }

  resolveInput(input) {
    // Basic simulation of variable replacement
    // In a real system, this would be a template engine
    let resolved = JSON.stringify(input);

    // Simple regex to find {{steps[N].output.key}} and {{steps.stepN.output.key}}
    resolved = resolved.replace(/\{\{steps(?:\[(\d+)\]|\.step(\d+))\.output\.(\w+)\}\}/gi, (match, id1, id2, key) => {
      const id = id1 || id2;
      return (this.context[id] && this.context[id][key]) || match;
    });

    return JSON.parse(resolved);
  }
}

module.exports = { Executor };
