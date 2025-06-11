import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import {validation as validate} from "../middlewares/validation.middleware.js";
import upload from "../middlewares/multer.middleware.js";

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


export default router;
