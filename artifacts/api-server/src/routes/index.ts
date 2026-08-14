import { Router, type IRouter } from "express";
import healthRouter from "./health";
import economyRouter from "./economy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(economyRouter);

export default router;
