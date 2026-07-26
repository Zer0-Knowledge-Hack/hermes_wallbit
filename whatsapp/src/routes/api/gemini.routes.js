import { Router } from "express";
import * as gemini from "../../controllers/gemini.controller.js";

const router = Router();
router.get("/config", gemini.getConfig);
router.put("/config", gemini.saveConfig);
router.get("/models", gemini.getModels);
router.post("/key", gemini.saveKey);
router.post("/validate", gemini.validateKey);
router.post("/prompt/reset", gemini.resetPrompt);
export default router;
