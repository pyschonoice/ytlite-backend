import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { COOKIE_AGE } from "../constants.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const options = {
  httpOnly: true,
  secure: true, // set to false if not using HTTPS locally
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
  const { username, fullName, email, password } = req.body;

  const existingUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (existingUser)
    throw new ApiError(409, "User already exists with same email");

  // Access uploaded files
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar Image is Required for profile completion.");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar || !avatar.url) {
    // Ensure avatar object and its URL exist
    throw new ApiError(500, "Failed to upload avatar image.");
  }

  let coverImage = null;
  if (coverImageLocalPath) {
    // Only attempt upload if a path is provided
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if (!coverImage || !coverImage.url) {
      throw new ApiError(500, "Failed to upload cover image.");
    }
  }

  const user = await User.create({
    username: username.toLowerCase(),
    password,
    email,
    fullName,
    avatar: avatar.url,
    coverImage: coverImage ? coverImage.url : "",
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
    .json(new ApiResponse(201, createdUser, "User registered Successfully."));
});

export { registerUser };
