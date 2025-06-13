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

export default router;
