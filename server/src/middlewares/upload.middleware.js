const multer = require("multer");

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(null, true);
  }
  const err = new Error(
    `Unsupported file type: ${file.mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}.`
  );
  err.name = "ValidationError";
  err.status = 400;
  return cb(err, false);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

module.exports = upload;

