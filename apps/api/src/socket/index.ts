import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { allowedWebOrigins } from "../config/cors.js";

export const createSocketServer = (server: HttpServer) =>
  new Server(server, {
    cors: {
      origin: allowedWebOrigins,
      credentials: true
    }
  });
