import { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { deleteOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";

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
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
  //TODO: get all videos based on query, sort, pagination
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

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched Successfully."));
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

export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus,
  getAllVideos,
};
