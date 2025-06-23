import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

// Define allowed origins for your frontend
const allowedOrigins = [
    'http://localhost:5173', // Your frontend's development URL on Windows
    'http://10.255.255.254:5173', // Your WSL2 frontend's URL (if it has a distinct IP from WSL2)
    'http://127.0.0.1:5173' ,
    'http://172.25.144.1:5173'
    // Add other frontend URLs if you use different ones (e.g., specific IPs when testing from mobile)
  ];
  
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true // Crucial: Allows cookies/authorization headers to be sent/received
  }));

app.use(cookieParser())
app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true,limit:"16kb"}))
app.use(express.static("public"))

//routes import
import userRouter from './routes/user.routes.js'
import healthcheckRouter from "./routes/healthcheck.routes.js"
import tweetRouter from "./routes/tweet.routes.js"
import subscriptionRouter from "./routes/subscription.routes.js"
import videoRouter from "./routes/video.routes.js"
import commentRouter from "./routes/comment.routes.js"
import likeRouter from "./routes/like.routes.js"
import playlistRouter from "./routes/playlist.routes.js"
import dashboardRouter from "./routes/dashboard.routes.js"

//routes declaration
app.use("/api/v1/healthcheck", healthcheckRouter)
app.use("/api/v1/user", userRouter)
app.use("/api/v1/tweet", tweetRouter)
app.use("/api/v1/subscribe", subscriptionRouter)
app.use("/api/v1/video", videoRouter)
app.use("/api/v1/comment", commentRouter)
app.use("/api/v1/like", likeRouter)
app.use("/api/v1/playlist", playlistRouter)
app.use("/api/v1/dashboard", dashboardRouter)

export { app }