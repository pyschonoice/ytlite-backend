import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const MONGODB_URI = process.env.MONGODB_URI

if(!MONGODB_URI){
    throw new Error("Mongodb url is not defined in the env");
} 

const connectDB = async () => {
    try{
        const connectionInstance = await mongoose.connect(`${MONGODB_URI}/${DB_NAME}`)
        console.log(`\n Mongodb connected successfully!! DB HOST : ${connectionInstance.connection.host}`)

    } catch(error){
        console.error("Mongodb connection FAILED : \n ", error);
        throw error;
        process.exit(1);
    }
}

export default connectDB;