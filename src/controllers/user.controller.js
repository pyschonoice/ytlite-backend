import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { COOKIE_AGE } from "../constants.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const options = {
  httpOnly: true,
  secure: true, // set to false if not using HTTPS locally
  sameSite: "Strict", // or 'Lax' if frontend is on another domain
  maxAge: COOKIE_AGE, // 7 days
};

const generateTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (err) {
    throw new ApiError(500, "Error while generating tokens.");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (existingUser)
    throw new ApiError(409, "User already exists with same email");

  const user = await User.create({
    username: username.toLowerCase(),
    password,
    email,
    fullname: "",
    avatar: "",
    coverImage: ""
  });
  // Check if user was actually created
  if (!user) {
    throw new ApiError(500, "Failed to create user during registration.");
  }

  const { accessToken, refreshToken } = generateTokens(user._id);

  // Fetch the user to send back, deselecting sensitive info
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .status(201)
    .json(
      new ApiResponse(
        201,
        createdUser,
        "User registered Successfully. Please complete profile."
      )
    );
});


export { registerUser };
