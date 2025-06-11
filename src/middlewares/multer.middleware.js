import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) { //cb here is the callback function you can say the next()
    cb(null, './public/temp')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})

export const upload = multer({ storage: storage })