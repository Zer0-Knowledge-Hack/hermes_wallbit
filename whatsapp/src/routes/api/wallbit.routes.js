import { Router } from "express";
import * as wallbit from "../../controllers/wallbit.controller.js";

const router = Router();
router.get("/balance", wallbit.getBalance);
router.get("/balance/stocks", wallbit.getStocksBalance);
router.get("/portfolio", wallbit.getPortfolio);
router.get("/wallets", wallbit.getWallets);
router.get("/transactions", wallbit.getTransactions);
router.get("/account", wallbit.getAccount);
router.get("/rates", wallbit.getRates);
router.post("/fees", wallbit.getFees);
router.get("/assets", wallbit.getAssets);
router.get("/assets/:symbol", wallbit.getAsset);
router.post("/trade/preview", wallbit.previewTrade);
router.post("/trade/execute", wallbit.executeTrade);
export default router;
