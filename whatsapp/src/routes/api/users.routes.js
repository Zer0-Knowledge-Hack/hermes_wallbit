import { Router } from "express";
import * as users from "../../controllers/users.controller.js";

const router = Router();
router.get("/", users.list);
export default router;
