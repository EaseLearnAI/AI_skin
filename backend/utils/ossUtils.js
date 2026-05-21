const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 检查OSS配置是否完整
const hasOSSConfig = () => {
  return process.env.OSS_ACCESS_KEY_ID && 
         process.env.OSS_ACCESS_KEY_SECRET && 
         process.env.OSS_BUCKET && 
         process.env.OSS_REGION;
};

// OSS客户端配置
let client = null;

if (hasOSSConfig()) {
  try {
    client = new OSS({
      region: process.env.OSS_REGION, // 华北 2（北京）
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET,
      authorizationV4: process.env.OSS_AUTHORIZATION_V4 === 'true', // 将字符串转换为布尔值
    });
    console.log('✅ OSS客户端初始化成功');
  } catch (error) {
    console.error('❌ OSS客户端初始化失败:', error.message);
  }
} else {
  console.warn('⚠️ OSS配置不完整，OSS功能将被禁用');
  console.warn('请在.env文件中配置以下环境变量:');
  console.warn('- OSS_ACCESS_KEY_ID');
  console.warn('- OSS_ACCESS_KEY_SECRET'); 
  console.warn('- OSS_BUCKET');
  console.warn('- OSS_REGION');
}

// 自定义请求头
const headers = {
  'x-oss-storage-class': 'Standard',
  'x-oss-object-acl': 'public-read', // 设置为公开读取，便于前端访问
};

/**
 * 上传文件到OSS (如果配置可用)
 * @param {Buffer|Stream|String} file - 文件内容或路径
 * @param {String} filename - 存储到OSS的文件名
 * @returns {Promise<Object>} - 上传结果，包含url
 */
const uploadToOSS = async (file, filename) => {
  try {
    // 如果OSS未配置，返回本地文件路径作为URL
    if (!client) {
      console.warn('⚠️ OSS未配置，返回本地文件路径');
      return {
        success: true,
        url: `/uploads/${filename}`,
        name: filename,
        local: true // 标记为本地文件
      };
    }

    // 生成唯一文件名，避免冲突
    const uniqueFilename = `${Date.now()}-${filename}`;
    
    let fileBuffer;
    
    // 处理不同类型的文件输入
    if (Buffer.isBuffer(file)) {
      fileBuffer = file;
    } else if (typeof file === 'string') {
      // 如果是文件路径，读取文件
      fileBuffer = fs.readFileSync(file);
    } else {
      // 假设是流，转换为Buffer
      fileBuffer = await streamToBuffer(file);
    }
    
    // 上传到OSS
    const result = await client.put(uniqueFilename, fileBuffer, { headers });
    
    console.log('OSS上传成功:', result.url);
    
    return {
      success: true,
      url: result.url,
      name: uniqueFilename,
      result
    };
  } catch (error) {
    console.error('OSS上传失败:', error);
    // 如果OSS上传失败，尝试保存到本地
    try {
      const localPath = path.join(__dirname, '../uploads', filename);
      
      let fileBuffer;
      if (Buffer.isBuffer(file)) {
        fileBuffer = file;
      } else if (typeof file === 'string') {
        fileBuffer = fs.readFileSync(file);
      } else {
        fileBuffer = await streamToBuffer(file);
      }
      
      // 确保uploads目录存在
      const uploadsDir = path.dirname(localPath);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      fs.writeFileSync(localPath, fileBuffer);
      
      return {
        success: true,
        url: `/uploads/${filename}`,
        name: filename,
        local: true, // 标记为本地文件
        fallback: true // 标记为降级方案
      };
    } catch (localError) {
      console.error('本地保存也失败:', localError);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * 从OSS下载文件
 * @param {String} ossFilename - OSS上的文件名
 * @param {String} localPath - 下载到本地的路径，可选
 * @returns {Promise<Object>} - 下载结果
 */
const downloadFromOSS = async (ossFilename, localPath = null) => {
  try {
    if (!client) {
      throw new Error('OSS客户端未配置');
    }

    const result = await client.get(ossFilename, localPath);
    
    console.log('OSS下载成功:', result.res.status);
    
    return {
      success: true,
      data: result.content, // 如果没有指定localPath，返回文件内容
      result
    };
  } catch (error) {
    console.error('OSS下载失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取OSS文件的URL
 * @param {String} ossFilename - OSS上的文件名
 * @returns {String} - 文件URL
 */
const getOSSFileUrl = (ossFilename) => {
  if (!client) {
    return `/uploads/${ossFilename}`;
  }
  return `https://${client.options.bucket}.${client.options.endpoint.replace('https://', '')}/${ossFilename}`;
};

/**
 * 将流转换为Buffer
 * @param {Stream} stream - 输入流
 * @returns {Promise<Buffer>} - Buffer数据
 */
const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

module.exports = {
  client,
  uploadToOSS,
  downloadFromOSS,
  getOSSFileUrl,
  hasOSSConfig
}; 