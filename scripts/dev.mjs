import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";

const npmCli = process.env["npm_execpath"];
const npmCommand = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const windowsDockerCommand = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const dockerCommand = process.platform === "win32" && existsSync(windowsDockerCommand) ? windowsDockerCommand : process.platform === "win32" ? "docker.exe" : "docker";
const dockerConfigDir = resolve(process.cwd(), ".docker-dev-config");
const dockerEnv = { ...process.env, DOCKER_CONFIG: dockerConfigDir };
const mongoHostPort = Number(process.env["MONGO_HOST_PORT"] ?? 27018);
const redisHostPort = Number(process.env["REDIS_HOST_PORT"] ?? 6380);

mkdirSync(dockerConfigDir, { recursive: true });

const run = (command, args, options = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? "inherit",
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
      }
    });
  });

const runQuiet = (command, args, options = {}) =>
  new Promise((resolveQuiet) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env
    });

    child.on("error", () => resolveQuiet(false));
    child.on("exit", (code) => resolveQuiet(code === 0));
  });

const canConnect = (port) =>
  new Promise((resolveConnect) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveConnect(result);
    };
    socket.setTimeout(1000);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });

const waitForPort = async (name, port) => {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (await canConnect(port)) {
      console.log(`${name} is ready on port ${port}`);
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`${name} did not become ready on port ${port}`);
};

const startDockerDesktop = () => {
  if (process.platform !== "win32") return;

  const dockerDesktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
  if (!existsSync(dockerDesktop)) return;

  const child = spawn(dockerDesktop, [], {
    stdio: "ignore",
    shell: false,
    detached: true,
    windowsHide: true
  });
  child.unref();
};

const waitForDocker = async () => {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    if (await runQuiet(dockerCommand, ["info"], { env: dockerEnv })) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  throw new Error("Docker Desktop did not become ready.");
};

try {
  console.log("Starting Docker Desktop, database, and cache services...");
  startDockerDesktop();
  await waitForDocker();
  await run(dockerCommand, ["compose", "up", "-d"], { env: dockerEnv });
  await Promise.all([waitForPort("Database service", mongoHostPort), waitForPort("Cache service", redisHostPort)]);
} catch (error) {
  console.error("Could not start database/cache services. Open Docker Desktop, wait until it says it is running, then run npm.cmd run dev again.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const processes = [
  {
    name: "api",
    args: ["run", "dev", "--workspace", "@ai-quiz-coach/api"]
  },
  {
    name: "web",
    args: ["run", "dev", "--workspace", "@ai-quiz-coach/web"]
  }
].map(({ name, args }) => {
  const childArgs = npmCli ? [npmCli, ...args] : args;
  const child = spawn(npmCommand, childArgs, {
    stdio: "inherit",
    shell: false,
    windowsHide: false
  });

  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
    if (signal) {
      console.error(`[${name}] exited with signal ${signal}`);
    }
  });

  return child;
});

const shutdown = () => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
