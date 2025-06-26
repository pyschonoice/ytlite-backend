import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user._id;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  const existingLike = await Like.findOne({
    video: videoId,
    likedBy: userId,
  });

  let message;
  let likeStatus = false;
  let createdOrDeletedLike;

  try {
    if (existingLike) {
      createdOrDeletedLike = await Like.findOneAndDelete({
        video: videoId,
        likedBy: userId,
      });
      message = "Video unliked successfully.";
      likeStatus = false;
    } else {
      createdOrDeletedLike = await Like.create({
        video: videoId,
        likedBy: userId,
      });
      message = "Video liked successfully.";
      likeStatus = true;
    }
  } catch (error) {
    console.error("Error toggling video like:", error);
    throw new ApiError(500, "Internal Server Error while toggling video like.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isLiked: likeStatus, like: createdOrDeletedLike },
        message
      )
    );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id;

  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found.");
  }

  const existingLike = await Like.findOne({
    comment: commentId,
    likedBy: userId,
  });

  let message;
  let likeStatus = false;
  let createdOrDeletedLike;

  try {
    if (existingLike) {
      createdOrDeletedLike = await Like.findOneAndDelete({
        comment: commentId,
        likedBy: userId,
      });
      message = "Comment unliked successfully.";
      likeStatus = false;
    } else {
      createdOrDeletedLike = await Like.create({
        comment: commentId,
        likedBy: userId,
      });
      message = "Comment liked successfully.";
      likeStatus = true;
    }
  } catch (error) {
    console.error("Error toggling comment like:", error);
    throw new ApiError(
      500,
      "Internal Server Error while toggling comment like."
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isLiked: likeStatus, like: createdOrDeletedLike },
        message
      )
    );
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user._id;

  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID.");
  }

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) {
    throw new ApiError(404, "Tweet not found.");
  }

  const existingLike = await Like.findOne({
    tweet: tweetId,
    likedBy: userId,
  });

  let message;
  let likeStatus = false;
  let createdOrDeletedLike;

  try {
    if (existingLike) {
      createdOrDeletedLike = await Like.findOneAndDelete({
        tweet: tweetId,
        likedBy: userId,
      });
      message = "Tweet unliked successfully.";
      likeStatus = false;
    } else {
      createdOrDeletedLike = await Like.create({
        tweet: tweetId,
        likedBy: userId,
      });
      message = "Tweet liked successfully.";
      likeStatus = true;
    }
  } catch (error) {
    console.error("Error toggling tweet like:", error);
    throw new ApiError(500, "Internal Server Error while toggling tweet like.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isLiked: likeStatus, like: createdOrDeletedLike },
        message
      )
    );
});

const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const pipeline = [];

  pipeline.push({
    $match: {
      likedBy: new mongoose.Types.ObjectId(userId),
      video: { $exists: true, $ne: null },
    },
  });

  pipeline.push({
    $lookup: {
      from: "videos",
      localField: "video",
      foreignField: "_id",
      as: "videoDetails",
      pipeline: [
        {
          $project: {
            thumbnail: 1,
            videoFile: 1,
            title: 1,
            description: 1,
            duration: 1,
            views: 1,
            isPublished: 1,
            owner: 1,
            createdAt: 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $match: {
      "videoDetails.0": { $exists: true },
    },
  });

  pipeline.push({
    $addFields: {
      videoDetails: {
        $first: "$videoDetails",
      },
    },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "videoDetails.owner",
      foreignField: "_id",
      as: "videoOwnerDetails",
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
      videoOwnerDetails: {
        $first: "$videoOwnerDetails",
      },
    },
  });

  pipeline.push({
    $project: {
      _id: "$videoDetails._id",
      thumbnail: "$videoDetails.thumbnail",
      videoFile: "$videoDetails.videoFile",
      title: "$videoDetails.title",
      description: "$videoDetails.description",
      duration: "$videoDetails.duration",
      views: "$videoDetails.views",
      isPublished: "$videoDetails.isPublished",
      owner: "$videoDetails.owner",
      videoOwnerDetails: "$videoOwnerDetails",
      likedAt: "$createdAt",
      createdAt: "$videoDetails.createdAt"
    },
  });

  const sortOptions = {};
  sortOptions[sortBy] = sortType === "asc" ? 1 : -1;
  pipeline.push({
    $sort: sortOptions,
  });

  const options = {
    page: pageNumber,
    limit: limitNumber,
    customLabels: {
      totalDocs: "totalLikedVideos",
      docs: "likedVideos",
    },
  };

  const result = await Like.aggregatePaginate(pipeline, options);

  if (!result.likedVideos || result.likedVideos.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalLikedVideos: 0,
          likedVideos: [],
          page: pageNumber,
          limit: limitNumber,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
        "No liked videos found."
      )
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Liked videos fetched successfully."));
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
