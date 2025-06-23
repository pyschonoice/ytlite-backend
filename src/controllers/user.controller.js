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
 // secure: true, // set to false if not using HTTPS locally
  secure: false, // for local dev
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

  const avatarResponse = await uploadOnCloudinary(avatarLocalPath);
  if (!avatarResponse || !avatarResponse.url || !avatarResponse.public_id) {
    // Ensure avatar object and its URL exist
    throw new ApiError(500, "Failed to upload avatar image.");
  }

  let coverImageResponse = null;
  if (coverImageLocalPath) {
    coverImageResponse = await uploadOnCloudinary(coverImageLocalPath);
    if (
      !coverImageResponse ||
      !coverImageResponse.url ||
      !coverImageResponse.public_id
    ) {
      throw new ApiError(500, "Failed to upload cover image.");
    }
  }

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

  const { accessToken, refreshToken } = generateTokens(user._id);

  // Fetch the user to send back, deselecting sensitive info
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered Successfully."));
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
  if (!incomingRefreshToken) throw new ApiError(401, "Unauthorized Request");

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) throw new ApiError(401, "Invalid Refresh Token");

    if (incomingRefreshToken !== user?.refreshToken)
      throw new ApiError(401, "Refresh Token is expired or used.");

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
      user._id
    );

    return res
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access Token Refreshed."
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Refresh Token is Invalid");
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
  console.log(fullName);
  console.log(email);
  if (!user) {
    return res.status(404).json(new ApiResponse(404, {}, "User not found"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User Details Updated Successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) throw new ApiError(400, "Avatar file is missing");
  //delete old avatar before uploading new
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const oldAvatarPublicId = user.avatar.public_id;

  const newAvatarResponse = await uploadOnCloudinary(avatarLocalPath);
  if (
    !newAvatarResponse ||
    !newAvatarResponse.url ||
    !newAvatarResponse.public_id
  ) {
    throw new ApiError(500, "Error while uploading new avatar.");
  }

  // Delete old avatar from Cloudinary
  if (oldAvatarPublicId) {
    await deleteOnCloudinary(oldAvatarPublicId);
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
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath)
    throw new ApiError(400, "Cover Image file is missing");
  
  const coverImageResponse = await uploadOnCloudinary(coverImageLocalPath);
  if (
    !coverImageResponse ||
    !coverImageResponse.url ||
    !coverImageResponse.public_id
  ) {
    throw new ApiError(500, "Failed to upload cover image.");
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const oldCoverImagePublicId = user.coverImage.public_id;

  // Delete old Cover from Cloudinary
  if (oldCoverImagePublicId) {
    await deleteOnCloudinary(oldCoverImagePublicId);
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

const getChannelProfile = asyncHandler( async ( req, res) => {
  const {username} = req.params
  if(!username?.trim()) throw new ApiError(400, "Username doesnt exist.")

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase()
      }
    },
    {
      $lookup:{
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from:"subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
      }
    },
    {
      $addFields: {
        subscribersCount : {
          $size : "$subscribers"
        },
        channelsSubscribedToCount : {
          $size : "$subscribedTo"
        },
        isSubscribed : {
          $cond : {
            if: { $in: [req.user?._id, "$subscribers.subscriber"]},
            then: true,
            else: false
          }
        }
      }
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
        email: 1
      }
    }
  ])
  if(!channel?.length) throw new ApiError(400,"Channel doesnt exist!")
  
  return res
  .status(200)
  .json(
    new ApiResponse(200,{channel: channel[0]},"User Channel Fetched Successfully.")
  )

})

const getUserHistory = asyncHandler( async (req, res ) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id)
      }
    },
    {
      $lookup:{
        from: "videos",
        localField:"watchHistory",
        foreignField:"_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as:"owner",
              pipeline: [
                {
                  $project:{
                    fullName: 1,
                    username: 1,
                    avatar: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              owner: {
                $first: "$owner"
              }
            }
          }
        ]
      }
    }
  ])

  return res
  .status(200)
  .json(
    new ApiResponse(200,user[0].watchHistory,"Watch History fetched successfully.")
  )

})

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
  getUserHistory
};
