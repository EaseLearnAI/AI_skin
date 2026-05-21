const axios = require('axios');

// API基础URL
const BASE_URL = 'http://localhost:5000/api';

// 测试用户数据
const TEST_USER = {
  name: 'Test User',
  email: 'abc1567849@gmail.com',
  password: '12345678'
};

// 彩色日志函数
const log = {
  success: (message) => console.log('\x1b[32m%s\x1b[0m', `✓ ${message}`),
  error: (message) => console.log('\x1b[31m%s\x1b[0m', `✗ ${message}`),
  info: (message) => console.log('\x1b[36m%s\x1b[0m', `ℹ ${message}`),
  json: (data) => console.log(JSON.stringify(data, null, 2))
};

// 注册新用户
async function registerUser() {
  try {
    log.info('🔑 注册新用户...');
    
    const response = await axios.post(`${BASE_URL}/users/register`, TEST_USER);
    
    log.success('用户注册成功');
    log.json(response.data);
    
    return true;
  } catch (error) {
    if (error.response?.data?.message?.includes('已存在') || 
        error.response?.data?.message?.includes('already exists')) {
      log.info('用户已存在，无需注册');
      return true;
    }
    
    log.error('用户注册失败');
    log.json(error.response?.data || error.message);
    return false;
  }
}

// 运行注册脚本
async function run() {
  console.log('\n==================================================');
  console.log('🚀 AI护肤系统 - 用户注册脚本');
  console.log('==================================================\n');
  
  try {
    await registerUser();
    
    console.log('\n==================================================');
    log.success('脚本执行完成');
    console.log('==================================================\n');
  } catch (error) {
    log.error('脚本执行失败');
    console.error(error);
  }
}

// 执行脚本
run(); 