import { Router, type IRouter } from "express";
import healthRouter from "./health";
import economyRouter from "./economy";
import gamesRouter from "./games";

const router: IRouter = Router();

router.use(healthRouter);
router.use(economyRouter);
router.use(gamesRouter);

export default router;
