import { Router } from "express";
import * as dashboard from "../../controllers/dashboard.controller.js";

const router = Router();
router.get("/kpis", dashboard.getKpis);
router.get("/activity", dashboard.getActivity);
export default router;
