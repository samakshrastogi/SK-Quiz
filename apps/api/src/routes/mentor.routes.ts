import { Router } from "express";
import { askMentor } from "../controllers/mentor.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const mentorRoutes = Router();

mentorRoutes.post("/ask", requireAuth, askMentor);
