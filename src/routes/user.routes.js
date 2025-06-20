import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import {validation as validate} from "../middlewares/validation.middleware.js";
import upload from "../middlewares/multer.middleware.js";
import * as authMiddleware from "../middlewares/auth.middleware.js"

const router = Router();

router.post("/register", validate,
    upload.fields([
        {
            name:"avatar",
            maxCount: 1
        },
        {
            name:"coverImage",
            maxCount: 1
        }
    ]), userController.registerUser);

router.post("/login",validate,userController.loginUser)

//authenticated routes
router.post("/logout",validate,authMiddleware.verifyJWT,userController.logoutUser)
router.post("/refresh-token",userController.refreshAccessToken)
router.get("/current-user",authMiddleware.verifyJWT,userController.getCurrentUser)
router.post("/change-password",validate,authMiddleware.verifyJWT,userController.changePassword)
router.patch("/update-user",validate,authMiddleware.verifyJWT,userController.updateAccountDetails)

router.patch("/update-avatar",authMiddleware.verifyJWT,upload.single("avatar"),userController.updateUserAvatar)
router.patch("/update-cover",authMiddleware.verifyJWT,upload.single("coverImage"),userController.updateUserCoverImage)

router.get("/c/:username",authMiddleware.verifyJWT,userController.getChannelProfile)
router.get("/history",authMiddleware.verifyJWT,userController.getUserHistory)


export default router;
