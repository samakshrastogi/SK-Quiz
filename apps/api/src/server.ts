import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./database/connect.js";
import { createSocketServer } from "./socket/index.js";
import { createQuizSchedulerWorker } from "./workers/quiz-scheduler.worker.js";

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);
let worker: ReturnType<typeof createQuizSchedulerWorker> | undefined;

try {
  await connectDatabase();
  worker = createQuizSchedulerWorker();

  server.listen(env.PORT, () => {
    console.log(`SK Quiz Coach API listening on http://localhost:${env.PORT}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const shutdown = async () => {
  await io.close();
  await worker?.close();
  server.close();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
