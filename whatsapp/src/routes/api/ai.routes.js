import { Router } from "express";
import * as ai from "../../controllers/ai.controller.js";

const router = Router();
router.get("/conversations", ai.listConversations);
router.get("/conversations/:id", ai.getConversation);
router.post("/chat", ai.chat);
export default router;
