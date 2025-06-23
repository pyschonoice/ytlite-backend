import mongoose, { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Channel username is missing or empty.");
  }

  const channel = await User.findOne({ username: username.trim() });
  if (!channel) {
    throw new ApiError(404, "Channel user not found!");
  }

  const channelId = channel._id;
  const subscriberId = req.user._id;

  if (channelId.equals(subscriberId)) {
    throw new ApiError(400, "You cannot subscribe to your own channel.");
  }

  const existingSubscription = await Subscription.findOne({
    subscriber: subscriberId,
    channel: channelId,
  });

  let message;
  let createdOrDeletedSubscription;

  try {
    if (existingSubscription) {
      createdOrDeletedSubscription = await Subscription.findOneAndDelete({
        subscriber: subscriberId,
        channel: channelId,
      });
      message = "Unsubscribed successfully";
    } else {
      createdOrDeletedSubscription = await Subscription.create({
        subscriber: subscriberId,
        channel: channelId,
      });
      message = "Subscribed successfully";
    }
  } catch (error) {
    throw new ApiError(
      500,
      "Internal Server Error while toggling subscription. Please try again."
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscribed: !existingSubscription,
        subscription: createdOrDeletedSubscription,
      },
      message
    )
  );
});

// controller to return subscribed list of a channel/user
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (!username?.trim()) {
    throw new ApiError(400, "Channel username is missing or empty.");
  }

  const channel = await User.findOne({ username: username.trim() });
  if (!channel) {
    throw new ApiError(404, "Channel user not found!");
  }

  const channelId = channel._id; // The _id of the channel whose subscribers we want to find

  const pipeline = [];

  // Match stage: Find all subscription documents where this user is the 'channel'

  pipeline.push({
    $match: {
      channel: new mongoose.Types.ObjectId(channelId),
    },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "subscriber",
      foreignField: "_id",
      as: "subscriberDetails",
      pipeline: [
        {
          $project: {
            fullName: 1,
            username: 1,
            avatar: 1,
            _id: 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $addFields: {
      subscriberDetails: {
        $first: "$subscriberDetails",
      },
    },
  });

  pipeline.push({
    $project: {
      _id: "$subscriberDetails._id",
      fullName: "$subscriberDetails.fullName",
      username: "$subscriberDetails.username",
      avatar: "$subscriberDetails.avatar",
      subscribedAt: "$createdAt", // Renaming 'createdAt' of subscription to 'subscribedAt'
    },
  });

  // Sort stage (optional, but good for pagination)
  // Defaulting to createdAt (subscribedAt) for subscribers
  const sortOptions = {};
  sortOptions[sortBy] = sortType === "asc" ? 1 : -1;

  pipeline.push({
    $sort: sortOptions,
  });

  const options = {
    page: pageNumber,
    limit: limitNumber,
    customLabels: {
      totalDocs: "totalSubscribers",
      docs: "subscribers",
    },
  };

  const result = await Subscription.aggregatePaginate(pipeline, options);

  // if (!result.subscribers || result.subscribers.length === 0) {
  //   throw new ApiError(404, `No subscribers found for ${username}.`);
  // }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        `Subscribers fetched successfully for ${username}.`
      )
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing or empty.");
  }

  //  Find the Subscriber User (the user whose subscribed channels we want to list)
  const subscriberUser = await User.findOne({ username: username.trim() });
  if (!subscriberUser) {
    throw new ApiError(404, "User not found!");
  }

  const subscriberId = subscriberUser._id;

  const pipeline = [];

  // Find all subscription documents where this user is the 'subscriber'
  pipeline.push({
    $match: {
      subscriber: new mongoose.Types.ObjectId(subscriberId),
    },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "channel",
      foreignField: "_id",
      as: "channelDetails",
      pipeline: [
        {
          $project: {
            fullName: 1,
            username: 1,
            avatar: 1,
            _id: 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $addFields: {
      channelDetails: {
        $first: "$channelDetails",
      },
    },
  });

  pipeline.push({
    $project: {
      _id: "$channelDetails._id",
      fullName: "$channelDetails.fullName",
      username: "$channelDetails.username",
      avatar: "$channelDetails.avatar",
      subscribedAt: "$createdAt",
    },
  });

  // Sort stage
  const sortOptions = {};
  sortOptions[sortBy] = sortType === "asc" ? 1 : -1;

  pipeline.push({
    $sort: sortOptions,
  });

  const options = {
    page: pageNumber,
    limit: limitNumber,
    customLabels: {
      totalDocs: "totalChannels",
      docs: "channels",
    },
  };

  const result = await Subscription.aggregatePaginate(pipeline, options);

  // if (!result.channels || result.channels.length === 0) {
  //   throw new ApiError(404, `No subscribed channels found for ${username}.`);
  // }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        `Subscribed channels fetched successfully for ${username}.`
      )
    );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
