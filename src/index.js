import dotenv from 'dotenv'
import connectDB from './db/db.js';
import express from "express"

dotenv.config({
    path: './env'
})

const app = express()
connectDB()