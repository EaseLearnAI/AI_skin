const fs = require('fs/promises');
const { ApiError } = require('../middlewares/error');

const policies = {
  product: { upload: 'uploadProductImage', allowGif: true, missingCode: 'IMAGE_REQUIRED', missingMessage: '请上传产品图片' },
  face: { upload: 'uploadFaceImage', allowGif: false, missingCode: 'FACE_IMAGE_REQUIRED', missingMessage: '请上传面部图片' }
};

const isSupportedImage = (data, allowGif) => (
  (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
  || (data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG')
  || (allowGif && data.toString('ascii', 0, 3) === 'GIF')
);

// Shared resource lifecycle; each service retains ownership checks and its database commit.
const createImageUploadWorkflow = ({ storageProvider, logger }) => {
  const cleanup = async (kind, resource, action) => {
    try {
      await action();
    } catch (error) {
      // Cleanup must not turn a persisted success into an error or hide the original failure.
      logger?.error?.({ event: 'image_cleanup_failed', kind, resource, errorName: error.name, errorCode: error.code });
    }
  };

  return async ({ kind, file, prepare = async () => undefined, persist }) => {
    const policy = policies[kind];
    if (!policy) throw new TypeError(`Unknown image upload kind: ${kind}`);
    if (!file) throw new ApiError(400, policy.missingMessage, policy.missingCode);
    let uploaded;
    try {
      const context = await prepare();
      if (!isSupportedImage(await fs.readFile(file.path), policy.allowGif)) {
        throw new ApiError(400, '文件内容不是受支持的图片', 'INVALID_IMAGE');
      }
      uploaded = await storageProvider[policy.upload](file);
      return await persist(uploaded, context);
    } catch (error) {
      if (uploaded) await cleanup(kind, 'uploaded_object', () => storageProvider.deleteObject(uploaded.key));
      throw error;
    } finally {
      await cleanup(kind, 'temporary_file', () => storageProvider.cleanupTempFile(file.path));
    }
  };
};

module.exports = { createImageUploadWorkflow };
