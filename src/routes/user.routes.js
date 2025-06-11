import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import * as validate from "../middlewares/validation.middleware.js";
import upload from "../middlewares/multer.middleware.js";

const router = Router();

router.post("/register", validate, userController.registerUser);


export default router;
