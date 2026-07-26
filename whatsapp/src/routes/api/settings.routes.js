import { Router } from "express";
import * as settings from "../../controllers/settings.controller.js";

const router = Router();
router.get("/", settings.getAll);
router.put("/:section", settings.saveSection);
export default router;
