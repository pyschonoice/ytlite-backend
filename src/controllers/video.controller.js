import { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { deleteOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

const validateFileType = (file, expectedType) => {
  if (!file) {
    throw new ApiError(400, `${expectedType} file is missing.`);
  }
  if (
    !file.mimetype.startsWith(expectedType === "video" ? "video/" : "image/")
  ) {
    throw new ApiError(
      400,
      `Invalid file type for ${file.fieldname}. Expected ${expectedType}.`
    );
  }
};

const validateVideoDetails = async (req) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Video ID is invalid or missing.");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video Not Found!");
  }

  if (!video.owner.equals(req.user._id)) {
    throw new ApiError(
      403,
      "Permission denied. User ID doesn't match with owner of the video."
    );
  }

  return video;
};

const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query,
    sortBy,
    sortType,
    userId,
    isPublished,
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const pipeline = [];

  if (query && query.trim() !== "") {
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: query.trim(), $options: "i" } },
          { description: { $regex: query.trim(), $options: "i" } },
        ],
      },
    });
  }

  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid userId provided for filtering.");
    }
    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    });
  }

  let publishedStatus = true; // Assume true by default
  if (isPublished !== undefined) {
    // If the parameter was actually provided
    if (String(isPublished).toLowerCase() === "false") {
      publishedStatus = false;
    }
  }
  pipeline.push({
    $match: {
      isPublished: publishedStatus,
    },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "owner",
      foreignField: "_id",
      as: "ownerDetails",
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
  });

  pipeline.push({
    $addFields: {
      ownerDetails: {
        $first: "$ownerDetails",
      },
    },
  });

  pipeline.push({
    $project: {
      _id: 1,
      thumbnail: 1,
      videoFile: 1,
      title: 1,
      description: 1,
      duration: 1,
      views: 1,
      isPublished: 1,
      createdAt: 1,
      updatedAt: 1,
      owner: 1,
      ownerDetails: 1,
    },
  });

  const options = {
    page: pageNumber,
    limit: limitNumber,
    customLabels: {
      totalDocs: "totalVideos",
      docs: "videos",
    },
  };

  if (sortBy) {
    const sortOrder = sortType === "asc" ? 1 : -1;
    options.sort = {
      [sortBy]: sortOrder,
    };
  } else {
    options.sort = {
      createdAt: -1,
    };
  }

  const result = await Video.aggregatePaginate(pipeline, options);
  if (!result.videos || result.videos.length === 0) {
    throw new ApiError(404, "No videos found matching criteria.");
  }

  return res
  .status(200)
  .json(
    new ApiResponse(
      200,
      result, // Send the entire result object with pagination info
      "Videos fetched successfully"
    )
  );
});

const publishVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
  if (!videoFileLocalPath) throw new ApiError(403, "Video file is needed!");

  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;
  if (!thumbnailLocalPath) throw new ApiError(403, "Thumbnail is needed!");

  // Validate file existence and type
  validateFileType(req.files?.videoFile?.[0], "video");
  validateFileType(req.files?.thumbnail?.[0], "image");

  const videoFileResponse = await uploadOnCloudinary(
    videoFileLocalPath,
    "video"
  );

  if (
    !videoFileResponse ||
    !videoFileResponse.url ||
    !videoFileResponse.public_id
  )
    throw new ApiError(500, "Error uploading video file.");

  const thumbnailResponse = await uploadOnCloudinary(
    thumbnailLocalPath,
    "image"
  );

  if (
    !thumbnailResponse ||
    !thumbnailResponse.url ||
    !thumbnailResponse.public_id
  )
    throw new ApiError(500, "Error uploading thumbnail file.");

  try {
    const video = await Video.create({
      title,
      description,
      videoFile: {
        url: videoFileResponse.url,
        public_id: videoFileResponse.public_id,
      },
      thumbnail: {
        url: thumbnailResponse.url,
        public_id: thumbnailResponse.public_id,
      },
      duration: videoFileResponse.duration,
      owner: req.user._id,
    });

    if (!video)
      throw new ApiError(
        500,
        "Something went wrong while uploading the video!"
      );

    return res
      .status(200)
      .json(new ApiResponse(200, video, "Video Uploaded Successfully!"));
  } catch (error) {
    if (videoFileResponse) {
      await deleteOnCloudinary(videoFileResponse.public_id);
    }
    if (thumbnailResponse) {
      await deleteOnCloudinary(thumbnailResponse.public_id);
    }
    throw new ApiError(
      500,
      "Something went wrong while uploading the video and the files were safely deleted from cloudinary."
    );
  }
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!videoId) throw new ApiError(400, "Video Id is invalid or missing.");

  const video = await Video.findById(videoId).populate(
    "owner",
    "fullName username avatar"
  );

  if (!video) throw new ApiError(404, "Video Not Found.");

  let likeCount = 0;
  let isLiked = false;
  if (req.user && req.user._id) {
    likeCount = await (await import("../models/like.model.js")).Like.countDocuments({ video: videoId });
    isLiked = await (await import("../models/like.model.js")).Like.exists({ video: videoId, likedBy: req.user._id });
  } else {
    likeCount = await (await import("../models/like.model.js")).Like.countDocuments({ video: videoId });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { ...video.toObject(), likeCount, isLiked: !!isLiked }, "Video fetched Successfully."));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const video = await validateVideoDetails(req);
  const { videoId } = req.params;
  await deleteOnCloudinary(video.videoFile.public_id, "video");
  await deleteOnCloudinary(video.thumbnail.public_id, "image");

  const deletedVideo = await Video.findByIdAndDelete(videoId);
  if (!deletedVideo)
    throw new ApiError(500, "Error while deleting the video from database.");

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video Deleted Successfully."));
});

const updateVideo = asyncHandler(async (req, res) => {
  const video = await validateVideoDetails(req);
  const { videoId } = req.params;

  const { title, description } = req.body;
  const thumbnail = req.file;

  const updatePayload = {
    $set: {
      title: title,
      description: description,
    },
  };

  let newThumbnailResponse = null;

  if (thumbnail) {
    validateFileType(thumbnail, "image");

    try {
      if (video.thumbnail && video.thumbnail.public_id) {
        await deleteOnCloudinary(video.thumbnail.public_id);
      }
    } catch (error) {
      // console.error(
      //   "Error deleting old thumbnail from Cloudinary:",
      //   error.message
      // );
      // throw new ApiError(500, "Server Error while Deleting old thumbnail.");
    }

    newThumbnailResponse = await uploadOnCloudinary(thumbnail.path, "image");

    if (
      !newThumbnailResponse ||
      !newThumbnailResponse.url ||
      !newThumbnailResponse.public_id
    ) {
      throw new ApiError(500, "Error uploading new thumbnail file.");
    }

    updatePayload.$set.thumbnail = {
      url: newThumbnailResponse.url,
      public_id: newThumbnailResponse.public_id,
    };
  }

  const updatedVideo = await Video.findByIdAndUpdate(videoId, updatePayload, {
    new: true,
  });

  if (!updatedVideo) throw new ApiError(500, "Failed to update video.");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, "Video Updated Successfully!"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const video = await validateVideoDetails(req);

  const { videoId } = req.params;
  console.log("is published- status", video.isPublished);
  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video.isPublished,
      },
    },
    { new: true }
  );

  if (!updatedVideo) throw new ApiError(500, "Failed to update video.");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedVideo,
        `Video Published Status Updated Successfully to ${updateVideo.isPublished}`
      )
    );
});

const incrementViewCount = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { views: 1 } },
    { new: true }
  );
  if (!video) throw new ApiError(404, "Video not found");

  // Add to user's watch history if authenticated
  if (req.user && req.user._id) {
    // Remove if already exists, then unshift to front, limit to 100
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $pull: { watchHistory: videoId },
      }
    );
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          watchHistory: {
            $each: [videoId],
            $position: 0,
          },
        },
      }
    );
    // Limit to 100 items
    await User.findByIdAndUpdate(
      req.user._id,
      [
        {
          $set: {
            watchHistory: { $slice: ["$watchHistory", 100] },
          },
        },
      ]
    );
  }

  return res.status(200).json(new ApiResponse(200, video, "View count incremented"));
});

export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus,
  getAllVideos,
  incrementViewCount,
};
