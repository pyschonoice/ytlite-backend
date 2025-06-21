import { Router } from "express";
import * as subscriptionController from "../controllers/subscriber.controller.js";
import * as authMiddleware from "../middlewares/auth.middleware.js"

const router = Router()

router.use(authMiddleware.verifyJWT)

router.route("/c/:username")
  .get(subscriptionController.getUserChannelSubscribers)
  .post(subscriptionController.toggleSubscription);

router.get("/u/:username",subscriptionController.getSubscribedChannels);

export default router;