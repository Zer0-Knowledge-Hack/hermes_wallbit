import { Router } from "express";
import * as analytics from "../../controllers/analytics.controller.js";

const router = Router();
router.get("/overview", analytics.overview);
export default router;
