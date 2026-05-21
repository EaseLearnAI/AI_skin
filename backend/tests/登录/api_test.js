const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Test user data
const testUser = {
  name: 'Test User API',
  email: `test${Date.now()}@example.com`,
  password: 'password123'
};

let token;

// Function to test registration
const testRegister = async () => {
  try {
    console.log('Testing user registration...');
    const response = await axios.post(`${API_URL}/users/register`, testUser);
    
    if (response.status === 201 && response.data.success) {
      console.log('✅ Registration successful');
      token = response.data.token;
      return true;
    } else {
      console.log('❌ Registration failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Registration failed with error:', error.response?.data || error.message);
    return false;
  }
};

// Function to test login
const testLogin = async () => {
  try {
    console.log('Testing user login...');
    const response = await axios.post(`${API_URL}/users/login`, {
      email: testUser.email,
      password: testUser.password
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Login successful');
      token = response.data.token;
      return true;
    } else {
      console.log('❌ Login failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Login failed with error:', error.response?.data || error.message);
    return false;
  }
};

// Function to test getting user profile
const testGetProfile = async () => {
  try {
    console.log('Testing get user profile...');
    const response = await axios.get(`${API_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Get profile successful');
      return true;
    } else {
      console.log('❌ Get profile failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Get profile failed with error:', error.response?.data || error.message);
    return false;
  }
};

// Main test function
const runTests = async () => {
  console.log('🚀 Starting API tests...');
  
  // Test registration
  const registrationSuccess = await testRegister();
  
  // Test login
  const loginSuccess = registrationSuccess ? await testLogin() : false;
  
  // Test get profile
  const profileSuccess = loginSuccess ? await testGetProfile() : false;
  
  // Print summary
  console.log('\n📋 Test Summary:');
  console.log(`Registration: ${registrationSuccess ? '✅ Pass' : '❌ Fail'}`);
  console.log(`Login: ${loginSuccess ? '✅ Pass' : '❌ Fail'}`);
  console.log(`Get Profile: ${profileSuccess ? '✅ Pass' : '❌ Fail'}`);
  
  if (registrationSuccess && loginSuccess && profileSuccess) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log('\n❌ Some tests failed.');
  }
};

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
}); 