import dotenv from 'dotenv'
import connectDB from './db/db.js';
import { app } from './app.js';

dotenv.config({
    path: './env'
})

const PORT = process.env.PORT || 4000
connectDB()
.then(() => {
    app.listen(PORT, '0.0.0.0', () => { 
        console.log("Server listening at ", PORT);
    });
})
.catch((err)=>{
    console.log("MongoDB connection failed after connected to DB !!",err)
})