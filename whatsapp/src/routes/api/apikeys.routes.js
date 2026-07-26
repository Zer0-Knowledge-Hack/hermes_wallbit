import { Router } from "express";
import * as apikeys from "../../controllers/apikeys.controller.js";

const router = Router();
router.get("/", apikeys.list);
router.post("/", apikeys.create);
router.put("/:id", apikeys.update);
router.delete("/:id", apikeys.remove);
router.post("/:id/validate", apikeys.validate);
export default router;
