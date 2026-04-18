# 🌌 Agentic MCP Gateway v2

> **Orchestrate. Evolve. Secure.** A state-of-the-art gateway for autonomous agent orchestration across Third-Party APIs (Notion, GitHub, Slack, Google Sheets).

## 🚀 Overview

The **Agentic MCP Gateway** is a sophisticated orchestration engine designed to bridge the gap between Natural Language (NL) intent and complex API workflows. Built on the principles of the **Model Context Protocol (MCP)**, it features a self-evolving execution engine that learns from past successes to optimize future operations.

### 💎 The "FlowState" Philosophy
Experience a seamless transition from thought to execution. The gateway provides an immersive, ambient interface that visualizes the "state of flow" within your automated environment.

---

## ✨ Key Features

### 🧠 Evolution Engine
Unlike static automation tools, our gateway **evolves**. Every execution is recorded and analyzed.
- **Workflow Optimization**: Automatically rearranges steps for maximum efficiency (e.g., parallelizing independent tasks).
- **Insight Generation**: Provides real-time feedback on how workflows were improved.

### 🔐 Multi-Layer Security & Vault
- **Encrypted Vault**: Securely manage tokens and sensitive keys via a unified dashboard.
- **Zero-Config Fallbacks**: Intelligent detection of configuration files (like `credentials.json`) with auto-syncing to the environment.
- **Approval Gates**: Critical actions (like sending external messages) pause for manual human-in-the-loop verification.

### 🤖 Multi-Agent Orchestration
Assign specialized agents to different segments of your workflow:
- **KINETIC**: Optimized for high-speed Notion operations.
- **RELEASES_LOG**: Dedicated to Google Sheets synchronization.
- **BROADCAST**: Handles real-time Slack notifications.

---

## 🏗️ Architecture

```mermaid
graph TD
    User((User)) -->|NL Prompt| Parser[LLM Parser - Groq/Llama3]
    Parser -->|DAG| Evolution[Evolution Engine]
    Evolution -->|Optimized Steps| Executor[DAG Executor]
    Executor -->|Connectors| APIs[Notion | GitHub | Sheets | Slack]
    APIs -->|Feedback| Evolution
    Vault[(Secure Vault)] --- Executor
```

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **Groq API Key** (for NL parsing)
- **GitHub Client Credentials** (for OAuth integration)

### 2. Quick Install
```bash
git clone https://github.com/DhwaniDalsania/agentic-mcp-gateway.git
cd agentic-mcp-gateway
npm install
```

### 3. Identity & Keys
The system automatically syncs keys from your environment. Ensure your `.env` contains the following:
- `GROQ_API_KEY`: Power the NL parser.
- `GITHUB_TOKEN`: Enable repository operations.
- `NOTION_API_KEY`: Connect your workspace.
- `GOOGLE_SA_JSON`: Minified service account credentials.

### 4. Launch
```bash
npm run dev
```
Visit `http://localhost:3002` to experience the ambient dashboard.

---

## 🔌 API Documentation

### Unified Execution
**Endpoint**: `POST /run`
The primary entry point for agentic workflows. Parses, optimizes, and executes in one go.

**Payload**:
```json
{
  "text": "Create a release task in Notion and notify the team on Slack"
}
```

**Response**:
```json
{
  "status": "completed",
  "executionMs": 1250,
  "evolution": {
    "optimized": true,
    "improvements": ["Parallelized Slack notification"]
  },
  "context": { ... }
}
```

---

## 🎨 Design System

The platform uses a **Premium Dark Aesthetic** with:
- **Organic Gradient Blobs**: CSS-powered ambient backgrounds.
- **Glassmorphic Cards**: Depth-focused UI components.
- **Micro-animations**: Subtle feedback for every agent action.

---

## 🛡️ License
MIT © 2026 Agentic Team.
