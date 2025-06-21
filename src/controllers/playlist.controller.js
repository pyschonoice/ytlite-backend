import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const ownerId = req.user._id;

  if (!name || name.trim() === "") {
    throw new ApiError(400, "Playlist name is required.");
  }
  if (!description || description.trim() === "") {
    throw new ApiError(400, "Playlist description is required.");
  }

  const playlist = await Playlist.create({
    name: name.trim(),
    description: description.trim(),
    owner: ownerId,
    videos: [],
  });

  if (!playlist) {
    throw new ApiError(500, "Failed to create playlist.");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, playlist, "Playlist created successfully!"));
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const pipeline = [];

  pipeline.push({
    $match: {
      owner: new mongoose.Types.ObjectId(userId),
    },
  });

  pipeline.push({
    $lookup: {
      from: "videos",
      localField: "videos",
      foreignField: "_id",
      as: "playlistVideos",

      pipeline: [{ $project: { _id: 1 } }],
    },
  });

  pipeline.push({
    $addFields: {
      videoCount: {
        $size: "$playlistVideos",
      },
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
      name: 1,
      description: 1,
      videoCount: 1,
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
      totalDocs: "totalPlaylists",
      docs: "playlists",
    },
  };

  const result = await Playlist.aggregatePaginate(pipeline, options);

  if (!result.playlists || result.playlists.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalPlaylists: 0,
          playlists: [],
          page: pageNumber,
          limit: limitNumber,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
        `No playlists found for user ${user.username}.`
      )
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Playlists fetched successfully!"));
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }

  const playlist = await Playlist.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId),
      },
    },

    {
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
    },

    {
      $addFields: {
        ownerDetails: {
          $first: "$ownerDetails",
        },
      },
    },

    {
      $lookup: {
        from: "videos",
        localField: "videos",
        foreignField: "_id",
        as: "playlistVideos",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "videoOwnerDetails",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                  },
                },
              ],
            },
          },

          {
            $addFields: {
              videoOwnerDetails: {
                $first: "$videoOwnerDetails",
              },
            },
          },

          {
            $project: {
              _id: 1,
              title: 1,
              description: 1,
              thumbnail: 1,
              duration: 1,
              views: 1,
              createdAt: 1,
              videoOwnerDetails: 1,
            },
          },
        ],
      },
    },

    {
      $project: {
        name: 1,
        description: 1,
        owner: 1,
        ownerDetails: 1,
        videos: "$playlistVideos",
        videoCount: { $size: "$playlistVideos" },
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  if (!playlist || playlist.length === 0) {
    throw new ApiError(404, "Playlist not found.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, playlist[0], "Playlist fetched successfully!"));
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user._id;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }
  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    throw new ApiError(404, "Playlist not found.");
  }
  if (!playlist.owner.equals(userId)) {
    throw new ApiError(
      403,
      "You are not authorized to add videos to this playlist."
    );
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  if (playlist.videos.includes(videoId)) {
    throw new ApiError(400, "Video already exists in this playlist.");
  }

  playlist.videos.push(videoId);
  await playlist.save({ validateBeforeSave: false });

  const updatedPlaylist = await Playlist.findById(playlistId).populate(
    "videos",
    "title thumbnail"
  );

  if (!updatedPlaylist) {
    throw new ApiError(500, "Failed to add video to playlist.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPlaylist,
        "Video added to playlist successfully!"
      )
    );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user._id;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }
  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    throw new ApiError(404, "Playlist not found.");
  }
  if (!playlist.owner.equals(userId)) {
    throw new ApiError(
      403,
      "You are not authorized to remove videos from this playlist."
    );
  }

  if (!playlist.videos.includes(videoId)) {
    throw new ApiError(400, "Video does not exist in this playlist.");
  }

  playlist.videos = playlist.videos.filter(
    (vid) => vid.toString() !== videoId.toString()
  );
  await playlist.save({ validateBeforeSave: false });

  const updatedPlaylist = await Playlist.findById(playlistId).populate(
    "videos",
    "title thumbnail"
  );

  if (!updatedPlaylist) {
    throw new ApiError(500, "Failed to remove video from playlist.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPlaylist,
        "Video removed from playlist successfully!"
      )
    );
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const userId = req.user._id;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    throw new ApiError(404, "Playlist not found.");
  }
  if (!playlist.owner.equals(userId)) {
    throw new ApiError(403, "You are not authorized to delete this playlist.");
  }

  const deletedPlaylist = await Playlist.findByIdAndDelete(playlistId);

  if (!deletedPlaylist) {
    throw new ApiError(500, "Failed to delete playlist.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Playlist deleted successfully!"));
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;
  const userId = req.user._id;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }

  if (!name && !description) {
    throw new ApiError(400, "Please provide a name or description to update.");
  }

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) {
    throw new new ApiError(404, "Playlist not found.")();
  }
  if (!playlist.owner.equals(userId)) {
    throw new ApiError(403, "You are not authorized to update this playlist.");
  }

  const updatePayload = {};
  if (name) updatePayload.name = name.trim();
  if (description) updatePayload.description = description.trim();

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $set: updatePayload },
    { new: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(500, "Failed to update playlist.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedPlaylist, "Playlist updated successfully!")
    );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};
