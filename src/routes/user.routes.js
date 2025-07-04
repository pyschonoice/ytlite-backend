import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { validation as validate } from "../middlewares/validation.middleware.js"; 
import upload from "../middlewares/multer.middleware.js";
import * as authMiddleware from "../middlewares/auth.middleware.js"

const router = Router();

router.post(
    "/register",
    upload.fields([ 
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    validate, 
    userController.registerUser
);

router.post("/login", validate, userController.loginUser); 

router.post("/refresh-token", userController.refreshAccessToken); 


router.post("/logout", authMiddleware.verifyJWT, validate, userController.logoutUser); 
router.get("/current-user", authMiddleware.verifyJWT, userController.getCurrentUser); 
router.post("/change-password", validate, authMiddleware.verifyJWT, userController.changePassword); 
router.patch("/update-user", validate, authMiddleware.verifyJWT, userController.updateAccountDetails); 

router.patch(
    "/update-avatar",
    authMiddleware.verifyJWT,
    upload.single("avatar"), 
    validate, 
    userController.updateUserAvatar
);

router.patch(
    "/update-cover",
    authMiddleware.verifyJWT,
    upload.single("coverImage"), 
    validate, 
    userController.updateUserCoverImage
);

router.get("/c/:username", userController.getChannelProfile); 
router.get("/history", authMiddleware.verifyJWT, userController.getUserHistory); 
router.delete("/history/:videoId", authMiddleware.verifyJWT, userController.removeFromHistory); 
router.delete("/history", authMiddleware.verifyJWT, userController.clearHistory); 

export default router;