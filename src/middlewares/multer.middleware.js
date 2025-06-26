// Before (disk storage):
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, './public/temp')
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname)
//   }
// })
// const upload = multer({ storage: storage })

// After (memory storage):
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(), 
   limits: {
    fileSize: 100 * 1024 * 1024, // 10M0B limit 
   },
});

export default upload;