const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:5000/api';

// 测试用户数据
const testUser = {
  name: 'Product Test User',
  email: `product_test_${Date.now()}@example.com`,
  password: 'password123'
};

// 测试产品数据
const testProduct = {
  name: '测试护肤品',
  description: '这是一个用于测试的护肤品'
};

// 测试图片路径
const testImagePath = path.join(__dirname, 'product.jpg');

let token;
let userId;
let productId;

// 创建测试图片（如果不存在）
const createTestImage = () => {
  // 检查测试图片是否存在
  if (!fs.existsSync(testImagePath)) {
    console.log('创建测试图片...');
    
    // 创建一个简单的测试图片（1x1像素的红色图片）
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 
      0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 
      0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 
      0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xdb, 0x00, 0x43, 0x01, 0x09, 0x09, 0x09, 0x0c, 0x0b, 0x0c, 
      0x18, 0x0d, 0x0d, 0x18, 0x32, 0x21, 0x1c, 0x21, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 
      0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 
      0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0x32, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 
      0x01, 0x00, 0x01, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 
      0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 
      0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 
      0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 
      0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 
      0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 
      0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 
      0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 
      0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 
      0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 
      0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 
      0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xc4, 0x00, 0x1f, 0x01, 0x00, 0x03, 0x01, 0x01, 0x01, 0x01, 
      0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 
      0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x11, 0x00, 0x02, 0x01, 0x02, 0x04, 0x04, 0x03, 0x04, 0x07, 0x05, 0x04, 0x04, 0x00, 
      0x01, 0x02, 0x77, 0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 
      0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 
      0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 
      0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 
      0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 
      0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 
      0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 
      0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 
      0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00, 0xf9, 
      0xfe, 0x8a, 0x28, 0xa0, 0x0f, 0xff, 0xd9
    ]);
    
    fs.writeFileSync(testImagePath, buffer);
    console.log('测试图片已创建:', testImagePath);
  } else {
    console.log('测试图片已存在:', testImagePath);
  }
};

// 注册用户
const testRegister = async () => {
  try {
    console.log('测试用户注册...');
    const response = await axios.post(`${API_URL}/users/register`, testUser);
    
    if (response.status === 201 && response.data.success) {
      console.log('✅ 用户注册成功');
      token = response.data.token;
      userId = response.data.data.user._id;
      return true;
    } else {
      console.log('❌ 用户注册失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 用户注册失败:', error.response?.data || error.message);
    return false;
  }
};

// 创建产品
const testCreateProduct = async () => {
  try {
    console.log('测试创建产品...');
    const response = await axios.post(
      `${API_URL}/products`,
      testProduct,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 201 && response.data.success) {
      console.log('✅ 产品创建成功');
      productId = response.data.data.product._id;
      console.log('产品ID:', productId);
      return true;
    } else {
      console.log('❌ 产品创建失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 产品创建失败:', error.response?.data || error.message);
    return false;
  }
};

// 上传产品图片
const testUploadProductImage = async () => {
  try {
    console.log('测试上传产品图片...');
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('productImage', fs.createReadStream(testImagePath));
    
    const response = await axios.post(
      `${API_URL}/products/${productId}/upload-image`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 产品图片上传成功');
      console.log('图片URL:', response.data.data.imageUrl);
      return true;
    } else {
      console.log('❌ 产品图片上传失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 产品图片上传失败:', error.response?.data || error.message);
    return false;
  }
};

// 提取产品成分
const testExtractIngredients = async () => {
  try {
    console.log('测试提取产品成分...');
    const response = await axios.post(
      `${API_URL}/products/${productId}/extract-ingredients`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 产品成分提取成功');
      console.log('提取到的成分:', response.data.data.ingredients);
      return true;
    } else {
      console.log('❌ 产品成分提取失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 产品成分提取失败:', error.response?.data || error.message);
    return false;
  }
};

// 获取产品列表
const testGetProducts = async () => {
  try {
    console.log('测试获取产品列表...');
    const response = await axios.get(
      `${API_URL}/products`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 获取产品列表成功');
      console.log(`总共 ${response.data.total} 个产品`);
      return true;
    } else {
      console.log('❌ 获取产品列表失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 获取产品列表失败:', error.response?.data || error.message);
    return false;
  }
};

// 获取单个产品
const testGetProduct = async () => {
  try {
    console.log('测试获取单个产品...');
    const response = await axios.get(
      `${API_URL}/products/${productId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 获取产品详情成功');
      console.log('产品名称:', response.data.data.product.name);
      console.log('产品成分:', response.data.data.product.ingredients);
      return true;
    } else {
      console.log('❌ 获取产品详情失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 获取产品详情失败:', error.response?.data || error.message);
    return false;
  }
};

// 更新产品
const testUpdateProduct = async () => {
  try {
    console.log('测试更新产品...');
    const response = await axios.put(
      `${API_URL}/products/${productId}`,
      {
        name: '更新后的测试护肤品',
        description: '这是更新后的测试护肤品描述'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 更新产品成功');
      console.log('更新后的产品名称:', response.data.data.product.name);
      return true;
    } else {
      console.log('❌ 更新产品失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 更新产品失败:', error.response?.data || error.message);
    return false;
  }
};

// 删除产品
const testDeleteProduct = async () => {
  try {
    console.log('测试删除产品...');
    const response = await axios.delete(
      `${API_URL}/products/${productId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ 删除产品成功');
      return true;
    } else {
      console.log('❌ 删除产品失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 删除产品失败:', error.response?.data || error.message);
    return false;
  }
};

// 主测试函数
const runTests = async () => {
  console.log('🚀 开始产品API测试...');
  
  // 创建测试图片
  createTestImage();
  
  // 用户注册（获取token）
  const registerSuccess = await testRegister();
  
  if (!registerSuccess) {
    console.log('❌ 用户注册失败，无法继续测试');
    return;
  }
  
  // 创建产品
  const createProductSuccess = await testCreateProduct();
  
  // 上传产品图片
  const uploadSuccess = createProductSuccess ? await testUploadProductImage() : false;
  
  // 提取产品成分
  const extractSuccess = uploadSuccess ? await testExtractIngredients() : false;
  
  // 获取产品列表
  const getProductsSuccess = createProductSuccess ? await testGetProducts() : false;
  
  // 获取单个产品
  const getProductSuccess = createProductSuccess ? await testGetProduct() : false;
  
  // 更新产品
  const updateSuccess = createProductSuccess ? await testUpdateProduct() : false;
  
  // 删除产品
  const deleteSuccess = createProductSuccess ? await testDeleteProduct() : false;
  
  // 打印测试摘要
  console.log('\n📋 测试摘要:');
  console.log(`用户注册: ${registerSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`创建产品: ${createProductSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`上传产品图片: ${uploadSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`提取产品成分: ${extractSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`获取产品列表: ${getProductsSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`获取产品详情: ${getProductSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`更新产品: ${updateSuccess ? '✅ 通过' : '❌ 失败'}`);
  console.log(`删除产品: ${deleteSuccess ? '✅ 通过' : '❌ 失败'}`);
  
  if (registerSuccess && createProductSuccess && uploadSuccess && extractSuccess && 
      getProductsSuccess && getProductSuccess && updateSuccess && deleteSuccess) {
    console.log('\n🎉 所有测试通过!');
  } else {
    console.log('\n❌ 部分测试失败.');
  }
};

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('运行测试时出错:', error);
  });
}

module.exports = { runTests }; 