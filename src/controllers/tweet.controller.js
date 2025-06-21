import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { Tweet } from "../models/tweet.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId, Schema } from "mongoose";

const createTweet = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id; // no need to check userId as it as an authenticated route
    const { content } = req.body; //validation happens in the middleware
    const tweet = await Tweet.create({
      content: content.trim(),
      owner: userId,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, tweet, "Tweet added successfully to user profile.")
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Internal Server Error while creating the tweet. Please try again."
    );
  }
});

const getUserTweets = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) throw new ApiError(400, "Username doesnt exist.");

  const user = await User.findOne({username:username.trim()});
  if (!user) throw new ApiError(400, "User Not found!");

  const { page = 1, limit = 10, sortType = "desc" } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const pipeline = [];

  pipeline.push({
    $match: {
      owner: new mongoose.Types.ObjectId(user._id),
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
      content: 1,
      ownerDetails: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  const options = {
    page: pageNumber,
    limit: limitNumber,
    customLabels: {
      totalDocs: "totalTweets",
      docs: "tweets",
    },
  };

  const sortOrder = sortType === "asc" ? 1 : -1;
  options.sort = {
    createdAt: sortOrder,
  };

  const result = await Tweet.aggregatePaginate(pipeline,options);
  if (!result.tweets || result.tweets.length === 0) {
    throw new ApiError(404, "No tweeets found matching criteria.");
  }

  return res
  .status(200)
  .json(
    new ApiResponse(
      200,
      result, // Send the entire result object with pagination info
      "Tweets fetched successfully"
    )
  );
});

const validateTweetDetails = async(req) => {
  const { tweetId } = req.params
  if(!tweetId || !isValidObjectId(tweetId)) throw new ApiError(400, "Tweet Id is invalid or missing.")
  
  const tweet = await Tweet.findById(tweetId)
  if(!tweet) throw new ApiError(404, "No Tweet found.")

  if(!tweet.owner.equals(req.user._id)) throw new ApiError(403,"Permission denied. User ID doesn't match with owner of the video.")
  
}

const deleteTweet = asyncHandler( async( req,res) => {
  await validateTweetDetails(req);
  const { tweetId } = req.params;

  const deletedTweet = await Tweet.findByIdAndDelete(tweetId);
  if (!deletedTweet)
    throw new ApiError(500, "Error while deleting the tweet from database.");

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Tweet Deleted Successfully."));
});

const updateTweet = asyncHandler(async(req,res) => {
  await validateTweetDetails(req);
  const { tweetId } = req.params;
  const { content } = req.body;

  const updatedTweet = await Tweet.findByIdAndUpdate(
    tweetId,
    {
      $set:{
        content
      }
    },
    {
      new:true
    }
  )
  if (!updatedTweet) throw new ApiError(500, "Failed to update tweet.");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTweet, "Tweet Updated Successfully!"));
});

const getOneTweet = asyncHandler(async( req,res ) => {
  const { tweetId } = req.params
  if(!tweetId || !isValidObjectId(tweetId)) throw new ApiError(400, "Tweet Id is invalid or missing.")
  
  const tweet = await Tweet.findById(tweetId).populate(
    "owner",
    "fullName username avatar"
  )
  if (!tweet) throw new ApiError(404, "Tweet Not Found.");

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, "Tweet fetched Successfully."));
});

export 
{ 
  createTweet, 
  getUserTweets, 
  deleteTweet, 
  updateTweet,
  getOneTweet
};
