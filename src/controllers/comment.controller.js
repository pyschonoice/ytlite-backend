import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const addComment = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { content } = req.body;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }
  if (!content || content.trim() === "") {
    throw new ApiError(400, "Comment content cannot be empty.");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  const ownerId = req.user._id;

  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    owner: ownerId,
  });

  if (!comment) {
    throw new ApiError(500, "Failed to add comment to video.");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, comment, "Comment added successfully!"));
});

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  const pipeline = [];

  pipeline.push({
    $match: {
      video: new mongoose.Types.ObjectId(videoId),
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
      content: 1,
      createdAt: 1,
      updatedAt: 1,
      owner: 1,
      ownerDetails: 1,
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
      totalDocs: "totalComments",
      docs: "comments",
    },
  };

  const result = await Comment.aggregatePaginate(pipeline, options);

  if (!result.comments || result.comments.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalComments: 0,
          comments: [],
          page: pageNumber,
          limit: limitNumber,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
        "No comments found for this video."
      )
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Comments fetched successfully!"));
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;

  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }
  if (!content || content.trim() === "") {
    throw new ApiError(400, "Comment content cannot be empty.");
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found.");
  }

  if (!comment.owner.equals(req.user._id)) {
    throw new ApiError(403, "You are not authorized to update this comment.");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    {
      $set: {
        content: content.trim(),
      },
    },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(500, "Failed to update comment.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedComment, "Comment updated successfully!")
    );
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found.");
  }

  if (!comment.owner.equals(req.user._id)) {
    throw new ApiError(403, "You are not authorized to delete this comment.");
  }

  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Failed to delete comment.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully!"));
});

export { getVideoComments, addComment, updateComment, deleteComment };
