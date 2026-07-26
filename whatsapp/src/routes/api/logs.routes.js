import { Router } from "express";
import * as logs from "../../controllers/logs.controller.js";

const router = Router();
router.get("/", logs.list);
router.get("/export", logs.exportLogs);
export default router;
