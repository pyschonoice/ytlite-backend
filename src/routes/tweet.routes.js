import { Router } from "express";
import * as tweetController from "../controllers/tweet.controller.js";
import * as authMiddleware from "../middlewares/auth.middleware.js";
import {validation as validate} from "../middlewares/validation.middleware.js";

const router = Router();

router.get("/c/:username", tweetController.getUserTweets);
router.get("/:tweetId",tweetController.getOneTweet);


router.use(authMiddleware.verifyJWT); // Apply verifyJWT middleware to all routes in this file
router.post("/create",validate, tweetController.createTweet);
router
  .route("/:tweetId")
  .delete(tweetController.deleteTweet)
  .patch(validate,tweetController.updateTweet)


export default router;