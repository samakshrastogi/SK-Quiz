import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";

export const createSocketServer = (server: HttpServer) =>
  new Server(server, {
    cors: {
      origin: env.WEB_ORIGIN,
      credentials: true
    }
  });
