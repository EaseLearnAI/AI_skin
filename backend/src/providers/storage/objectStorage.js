const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const OSS = require('ali-oss');

const { ApiError } = require('../../middlewares/error');

const createAliOssClient = (config) => {
  if (!config.configured) return null;
  return new OSS({
    region: config.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    authorizationV4: config.authorizationV4
  });
};

const extension = (originalName) => {
  const value = path.extname(originalName || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif'].includes(value) ? value : '.jpg';
};

const createObjectStorageProvider = ({
  client,
  productImagesPublic = false,
  faceSignedUrlExpiresSeconds = 900,
  fsPromises = fs,
  now = Date.now
}) => {
  if (!client) {
    const unavailable = async () => { throw new ApiError(503, '对象存储尚未配置', 'STORAGE_NOT_CONFIGURED'); };
    return {
      uploadProductImage: unavailable,
      uploadFaceImage: unavailable,
      deleteObject: unavailable,
      getPrivateUrl: unavailable,
      getProductUrl: unavailable,
      cleanupTempFile: async (filePath) => {
        try { await fsPromises.unlink(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    };
  }

  const put = async (prefix, file, acl, expires) => {
    const key = `${prefix}/${now()}-${randomUUID()}${extension(file.originalname)}`;
    const content = await fsPromises.readFile(file.path);
    const result = await client.put(key, content, {
      headers: {
        'x-oss-storage-class': 'Standard',
        'x-oss-object-acl': acl
      }
    });
    const url = acl === 'public-read' ? result.url : client.signatureUrl(key, { expires });
    return { key, url };
  };

  return {
    uploadProductImage: (file) => put(
      'products',
      file,
      productImagesPublic ? 'public-read' : 'private',
      3600
    ),
    uploadFaceImage: (file) => put('faces', file, 'private', faceSignedUrlExpiresSeconds),
    deleteObject: async (key) => {
      if (!key || (!key.startsWith('faces/') && !key.startsWith('products/'))) {
        throw new ApiError(400, '对象存储键不合法', 'INVALID_STORAGE_KEY');
      }
      await client.delete(key);
    },
    getPrivateUrl: (key) => client.signatureUrl(key, { expires: faceSignedUrlExpiresSeconds }),
    getProductUrl: (key, currentUrl) => (
      productImagesPublic ? currentUrl : client.signatureUrl(key, { expires: 3600 })
    ),
    cleanupTempFile: async (filePath) => {
      try {
        await fsPromises.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  };
};

module.exports = { createAliOssClient, createObjectStorageProvider };
