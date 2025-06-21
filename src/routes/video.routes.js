import { Router } from "express";
import * as videoController from "../controllers/video.controller.js";
import { validation as validate } from "../middlewares/validation.middleware.js";
import upload from "../middlewares/multer.middleware.js";
import * as authMiddleware from "../middlewares/auth.middleware.js"; 

const router = Router();

router.get("/", videoController.getAllVideos); // Get all videos (public)
router.get("/:videoId", videoController.getVideoById); // Get a specific video by ID (public)


router.use(authMiddleware.verifyJWT);

router.post(
  "/create",
  validate,
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  videoController.publishVideo
);

router
  .route("/:videoId")
  .delete(videoController.deleteVideo) 
  .patch(validate, upload.single("thumbnail"), videoController.updateVideo); 

router.patch("/toggle-publish/:videoId", videoController.togglePublishStatus); 

export default router;