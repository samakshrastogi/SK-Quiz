import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build, preview } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(projectRoot, "apps/web");
const command = process.argv[2] ?? "dev";

const config = {
  root: webRoot,
  configFile: false,
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5474
  },
  preview: {
    host: "0.0.0.0",
    port: 5474
  }
};

if (command === "build") {
  await build(config);
} else if (command === "preview") {
  const server = await preview(config);
  server.printUrls();
} else {
  await build(config);
  const server = await preview(config);
  server.printUrls();
}
