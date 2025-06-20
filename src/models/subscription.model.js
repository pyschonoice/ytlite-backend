import mongoose, {Schema} from "mongoose";

const subscriptionSchema = new Schema({
  subscriber : {
    type: Schema.Types.ObjectId, // one who subscribes
    ref: "User"
  },
  channel : {
    type: Schema.Types.ObjectId, // one to which you subscribe
    ref: "User"
  }
}, {timestamps : true})

export const Subscription = mongoose.model("Subscription",subscriptionSchema)