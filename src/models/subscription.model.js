import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
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

subscriptionSchema.plugin(mongooseAggregatePaginate)
export const Subscription = mongoose.model("Subscription",subscriptionSchema)