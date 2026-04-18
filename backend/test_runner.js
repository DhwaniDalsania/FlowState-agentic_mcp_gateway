// backend/test_runner.js

const notion = require("./tools/notion_tool");
const github = require("./tools/github_tool");
const slack = require("./tools/slack_tool");
const sheets = require("./tools/sheets_tool");

// Tool registry (makes it scalable)
const tools = {
    notion,
    github,
    slack,
    sheets
};

// Sample workflow (later replace with LLM output)
const workflow = {
    workflow_name: "Bug Handling Workflow",
    steps: [
        {
            step_id: "1",
            tool: "notion",
            action: "get_page",
            input: { priority: "critical" },
            depends_on: [],
            requires_approval: false
        },
        {
            step_id: "2",
            tool: "github",
            action: "create_branch",
            input: { branch_name: "bugfix-{issue_id}" },
            depends_on: ["1"],
            requires_approval: false
        },
        {
            step_id: "3",
            tool: "slack",
            action: "send_message",
            input: { message: "Bug {issue_id} handled" },
            depends_on: ["2"],
            requires_approval: true
        },
        {
            step_id: "4",
            tool: "sheets",
            action: "append_row",
            input: { row: ["{issue_id}", "critical", "handled"] },
            depends_on: ["2"],
            requires_approval: false
        }
    ]
};

// Store outputs of each step
const stepOutputs = {};

// Replace placeholders like {issue_id}
function replacePlaceholders(input, context) {
    const str = JSON.stringify(input);
    const replaced = str.replace(/{(.*?)}/g, (_, key) => context[key] || "");
    return JSON.parse(replaced);
}

// Main execution function
async function runWorkflow(workflow) {
    console.log(`🚀 Starting: ${workflow.workflow_name}\n`);

    for (const step of workflow.steps) {
        console.log(`➡️ Executing Step ${step.step_id}: ${step.tool}.${step.action}`);

        // Check dependencies
        for (const dep of step.depends_on) {
            if (!stepOutputs[dep]) {
                console.log(`❌ Dependency ${dep} not completed`);
                return;
            }
        }

        // Handle approval
        if (step.requires_approval) {
            console.log(`⏳ Waiting for approval (auto-approved for demo)\n`);
        }

        // Build context from previous outputs
        const context = {};
        Object.values(stepOutputs).forEach(output => {
            if (output?.data?.id) {
                context["issue_id"] = output.data.id;
            }
        });

        // Replace placeholders
        const finalInput = replacePlaceholders(step.input, context);

        try {
            const result = await tools[step.tool].execute(step.action, finalInput);

            console.log(`✅ Result:`, result, "\n");

            if (result.status === "error") {
                console.log(`❌ Error in step ${step.step_id}: ${result.error}`);
                return;
            }

            stepOutputs[step.step_id] = result;

        } catch (err) {
            console.log(`🔥 Exception in step ${step.step_id}:`, err.message);
            return;
        }
    }

    console.log("🎉 Workflow Completed Successfully!");
}

// Run it
runWorkflow(workflow);