# Deployment Guide

## Production Requirements

- Node.js 22 LTS or newer.
- MongoDB replica set.
- Redis with persistence enabled.
- HTTPS termination at the edge.
- Secrets stored in a managed secret manager.
- Separate AI provider API key per environment.

## Build

```bash
npm ci
npm run typecheck
npm run test
npm run build
```

## Runtime

Run API and workers as separate processes. The web app can be served from a CDN after `vite build`.

Recommended process split:

- `api`: HTTP REST and Socket.IO.
- `worker-quiz-scheduler`: BullMQ quiz reminders and notification fanout.
- `worker-ai-generation`: background question generation batches.

## Environment

Use `.env.example` as the source of required variables. Never expose `GEMINI_API_KEY`, JWT secrets, OAuth secrets, or SMTP credentials to the frontend.
