import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            url:{
                type: String, //cloudinary url
                required: true
            },
            public_id: {
                type: String, //cloudinary public_id
                required: true
            }
           
        },
        thumbnail: {
           url:{
                type: String, //cloudinary url
                required: true
            },
            public_id: {
                type: String, //cloudinary public_id
                required: true
            }
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String, 
            required: true
        },
        duration: {
            type: Number, //get from cloudinary data
            required: true
        },
        views: {
            type: Number,
            default: 0
        },
        isPublished: {
            type: Boolean,
            default: true
        },
        isPublic: {
            type: Boolean,
            default: true
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    },
    {
        timestamps: true
    }
)

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model("Video",videoSchema);