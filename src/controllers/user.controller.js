import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { COOKIE_AGE } from "../constants.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const options = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  maxAge: COOKIE_AGE, // 7 days
};

const generateTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found during token generation");
    }
    const accessToken = user.generateAccessToken(); // Method on user model
    const refreshToken = user.generateRefreshToken(); // Method on user model

    // Store new refresh token on user in DB
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error in generateTokens:", error);
    throw new ApiError(500, "Failed to generate new tokens.");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { username, fullName, email, password } = req.body;

  const existingUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (existingUser)
    throw new ApiError(409, "User already exists with same email");

  const avatarFileObject = req.files?.avatar?.[0];
  const coverImageFileObject = req.files?.coverImage?.[0];

  if (!avatarFileObject) {
    // Check for the existence of the file object itself
    throw new ApiError(400, "Avatar Image is Required for profile completion.");
  }

  const avatarResponse = await uploadOnCloudinary(avatarFileObject, "image"); // Added resourceType for clarity
  if (!avatarResponse || !avatarResponse.url || !avatarResponse.public_id) {
    throw new ApiError(500, "Failed to upload avatar image.");
  }

  let coverImageResponse = null;
  if (coverImageFileObject) {
    // Check if cover image was provided

    coverImageResponse = await uploadOnCloudinary(
      coverImageFileObject,
      "image"
    ); // Added resourceType for clarity
    if (
      !coverImageResponse ||
      !coverImageResponse.url ||
      !coverImageResponse.public_id
    ) {
      throw new ApiError(500, "Failed to upload cover image.");
    }
  }

  try {
    // Added try-catch for better error handling and cleanup
    const user = await User.create({
      username: username.toLowerCase(),
      password,
      email,
      fullName,
      avatar: {
        url: avatarResponse.url,
        public_id: avatarResponse.public_id,
      },
      coverImage: coverImageResponse
        ? {
            url: coverImageResponse.url,
            public_id: coverImageResponse.public_id,
          }
        : null, // Store null if no cover image
    });

    // Check if user was actually created
    if (!user) {
      throw new ApiError(500, "Failed to create user during registration.");
    }

    const { accessToken, refreshToken } = await generateTokens(user._id);

    // Fetch the user to send back, deselecting sensitive info
    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    return res
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .status(201)
      .json(new ApiResponse(201, createdUser, "User registered Successfully."));
  } catch (error) {
    // Cleanup Cloudinary uploads if user creation in DB fails
    if (avatarResponse && avatarResponse.public_id) {
      await deleteOnCloudinary(avatarResponse.public_id, "image");
    }
    if (coverImageResponse && coverImageResponse.public_id) {
      await deleteOnCloudinary(coverImageResponse.public_id, "image");
    }
    console.error("Error during user registration:", error);
    throw new ApiError(
      500,
      "Failed to register user. Uploaded files were cleaned up."
    );
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user)
    throw new ApiError(404, "User with this username or email does not exist.");

  const isPasswordValid = await user.isPasswordValid(password);
  if (!isPasswordValid)
    throw new ApiError(401, "Invalid user credentials (incorrect password).");

  const { accessToken, refreshToken } = await generateTokens(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in Successfully."
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  return res
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .status(200)
    .json(new ApiResponse(200, {}, "User logged out successfully."));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized Request: Refresh token missing.");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid Refresh Token: User not found.");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      return res
        .status(401)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
          new ApiResponse(
            401,
            null,
            "Refresh Token is expired or used. Please re-login."
          )
        );
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
      user._id
    );

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken, // This refresh token is usually not sent back to client
          },
          "Access Token Refreshed."
        )
      );
  } catch (error) {
    throw new ApiError(
      401,
      error?.message || "Invalid Refresh Token or Authentication Failure."
    );
  }
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  const isPasswordValid = user.isPasswordValid(oldPassword);
  if (!isPasswordValid) throw new ApiError(400, "Invalid user password.");

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "User Password changed successfully."));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User Details Fetched Successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    return res.status(404).json(new ApiResponse(404, {}, "User not found"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User Details Updated Successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarFileObject = req.file;
  if (!avatarFileObject) throw new ApiError(400, "Avatar file is missing");

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const oldAvatarPublicId = user.avatar?.public_id;

  const newAvatarResponse = await uploadOnCloudinary(avatarFileObject, "image");
  if (
    !newAvatarResponse ||
    !newAvatarResponse.url ||
    !newAvatarResponse.public_id
  ) {
    throw new ApiError(500, "Error while uploading new avatar.");
  }

  if (oldAvatarPublicId) {
    try {
      await deleteOnCloudinary(oldAvatarPublicId, "image");
    } catch (error) {}
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: {
          url: newAvatarResponse.url,
          public_id: newAvatarResponse.public_id,
        },
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "User Avatar Updated Successfully")
    );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageFileObject = req.file;
  if (!coverImageFileObject)
    throw new ApiError(400, "Cover Image file is missing");

  const coverImageResponse = await uploadOnCloudinary(
    coverImageFileObject,
    "image"
  );
  if (
    !coverImageResponse ||
    !coverImageResponse.url ||
    !coverImageResponse.public_id
  ) {
    throw new ApiError(500, "Failed to upload cover image.");
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const oldCoverImagePublicId = user.coverImage?.public_id;

  if (oldCoverImagePublicId) {
    try {
      await deleteOnCloudinary(oldCoverImagePublicId, "image");
    } catch (error) {}
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: {
          url: coverImageResponse.url,
          public_id: coverImageResponse.public_id,
        },
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "User Cover Image Updated Successfully")
    );
});
const getChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) throw new ApiError(400, "Username doesnt exist.");

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);
  if (!channel?.length) throw new ApiError(400, "Channel doesnt exist!");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { channel: channel[0] },
        "User Channel Fetched Successfully."
      )
    );
});

const getUserHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  const history = user[0]?.watchHistory || [];

  return res
    .status(200)
    .json(new ApiResponse(200, history, "Watch History fetched successfully."));
});

const removeFromHistory = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!videoId) throw new ApiError(400, "Video ID is required");
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { watchHistory: videoId },
  });
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video removed from watch history."));
});

const clearHistory = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $set: { watchHistory: [] } });
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Watch history cleared."));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changePassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getChannelProfile,
  getUserHistory,
  removeFromHistory,
  clearHistory,
};
