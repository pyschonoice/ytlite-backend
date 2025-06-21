import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getChannelStats = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!channelId || !isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID.");
  }

  const channelUser = await User.findById(channelId);
  if (!channelUser) {
    throw new ApiError(404, "Channel not found.");
  }

  const stats = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(channelId),
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
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        as: "videos",
      },
    },

    {
      $unwind: {
        path: "$videos",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "likes",
        localField: "videos._id",
        foreignField: "video",
        as: "videoLikes",
      },
    },

    {
      $lookup: {
        from: "comments",
        localField: "videos._id",
        foreignField: "video",
        as: "comments",
      },
    },

    {
      $unwind: {
        path: "$comments",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "likes",
        localField: "comments._id",
        foreignField: "comment",
        as: "commentLikes",
      },
    },

    {
      $group: {
        _id: "$_id",
        totalSubscribers: { $sum: { $size: "$subscribers" } },
        totalVideos: {
          $sum: { $cond: [{ $ifNull: ["$videos._id", false] }, 1, 0] },
        },
        totalViews: { $sum: "$videos.views" },
        totalVideoLikes: { $sum: { $size: "$videoLikes" } },
        totalCommentLikes: { $sum: { $size: "$commentLikes" } },
      },
    },

    {
      $project: {
        _id: 0,
        totalSubscribers: 1,
        totalVideos: 1,
        totalViews: { $ifNull: ["$totalViews", 0] },
        totalLikes: { $sum: ["$totalVideoLikes", "$totalCommentLikes"] },
      },
    },
  ]);

  if (!stats || stats.length === 0) {
    throw new ApiError(500, "Could not fetch channel statistics.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, stats[0], "Channel statistics fetched successfully.")
    );
});

const getChannelVideos = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
    isPublished,
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (!channelId || !isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID.");
  }

  const channelUser = await User.findById(channelId);
  if (!channelUser) {
    throw new ApiError(404, "Channel not found.");
  }

  const pipeline = [];

  pipeline.push({
    $match: {
      owner: new mongoose.Types.ObjectId(channelId),
    },
  });

  if (isPublished !== undefined) {
    const publishedStatus = String(isPublished).toLowerCase() === "true";
    pipeline.push({
      $match: {
        isPublished: publishedStatus,
      },
    });
  }

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
      owner: 1,
      ownerDetails: 1,
      createdAt: 1,
      updatedAt: 1,
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
      totalDocs: "totalVideos",
      docs: "videos",
    },
  };

  const result = await Video.aggregatePaginate(pipeline, options);

  if (!result.videos || result.videos.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalVideos: 0,
          videos: [],
          page: pageNumber,
          limit: limitNumber,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
        `No videos found for channel ${channelUser.username}.`
      )
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Channel videos fetched successfully!"));
});

export { getChannelStats, getChannelVideos };
