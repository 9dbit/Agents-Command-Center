# Agents Command Center

A visual operating system for an AI workforce. The MVP turns departments, agents, tasks, approvals, tools, and organizational memory into one command surface.

## Current MVP

- HQ overview with 6 departments
- Department command view
- Department Lead chat shell
- Live agent floor visualization
- Kanban-style workboard
- Approval counter
- Tool connection registry
- Organization Brain placeholder
- Missions placeholder
- Express API and `/api/health`
- Railway deployment config

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
API: `http://localhost:3000`

## Production

```bash
npm install
npm run build
npm start
```

Railway health check: `/api/health`

## Next

1. PostgreSQL + Drizzle schema and persistence
2. Real Lead / Worker orchestration layer
3. Approval workflow with audit trail
4. Brain ingestion/search
5. MCP and direct tool adapters
6. Realtime events and durable task execution
