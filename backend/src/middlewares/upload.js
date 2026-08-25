const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');

const { ApiError } = require('./error');

const tempDir = path.join(os.tmpdir(), 'ai_skin_uploads');
fs.mkdirSync(tempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, tempDir),
  filename: (req, file, callback) => {
    const safeExtension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`);
  }
});

const createImageUpload = (fieldName, maxSize) => {
  const upload = multer({
    storage,
    limits: { fileSize: maxSize },
    fileFilter: (req, file, callback) => {
      const allowed = new Set(['image/jpeg', 'image/png', 'image/gif']);
      callback(allowed.has(file.mimetype) ? null : new ApiError(400, '只允许上传图片文件', 'INVALID_IMAGE'), allowed.has(file.mimetype));
    }
  }).single(fieldName);
  return (req, res, next) => upload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `文件大小不能超过${Math.round(maxSize / 1024 / 1024)}MB`, 'FILE_TOO_LARGE'));
    }
    return next(new ApiError(400, '文件上传失败', 'UPLOAD_FAILED'));
  });
};

module.exports = { createImageUpload };
