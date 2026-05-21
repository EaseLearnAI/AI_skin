const request = require('supertest');
const mongoose = require('mongoose');

process.env.MONGODB_URI = 'mongodb://localhost:27017/aiskin_test';
process.env.PORT = '0';
process.env.API_KEY = 'test-api-key';

const app = require('../../server');
const User = require('../../models/userModel');

// Test user data
const testUser = {
  name: 'Test User',
  phone: '13900000001',
  password: 'password123',
  gender: 'female'
};

// Clear test database before tests
beforeAll(async () => {
  await User.deleteMany({});
});

// Close database connection after tests
afterAll(async () => {
  await mongoose.connection.close();
  app.close();
});

describe('User API', () => {
  // Test user registration
  describe('POST /api/users/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send(testUser);
      
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('phone', testUser.phone);
      expect(res.body.data.user).toHaveProperty('name', testUser.name);
      expect(res.body.data.user).toHaveProperty('gender', testUser.gender);
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('should not register a user with existing phone', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send(testUser);
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toContain('该手机号已被注册');
    });

    it('should not register a user without required fields', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({ phone: '13900000002' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  // Test user login
  describe('POST /api/users/login', () => {
    it('should login a user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          phone: testUser.phone,
          password: testUser.password
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('phone', testUser.phone);
    });

    it('should not login a user with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          phone: testUser.phone,
          password: 'wrongpassword'
        });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('success', false);
    });

    it('should not login a non-existent user', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          phone: '13900000999',
          password: 'password123'
        });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  // Test protected routes
  describe('GET /api/users/me', () => {
    let token;

    beforeAll(async () => {
      // Login to get token
      const res = await request(app)
        .post('/api/users/login')
        .send({
          phone: testUser.phone,
          password: testUser.password
        });
      
      token = res.body.token;
    });

    it('should get user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.user).toHaveProperty('phone', testUser.phone);
    });

    it('should not get user profile without token', async () => {
      const res = await request(app)
        .get('/api/users/me');
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('success', false);
    });

    it('should not get user profile with invalid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('success', false);
    });
  });
}); 
