const express = require('express');
const { 
  register, 
  login, 
  getMe,
  updateUsername,
  updateGender,
  updateAge,
  updateMenstrualCycle,
  getUserStats,
  logout
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.patch('/update-username', protect, updateUsername);
router.patch('/update-gender', protect, updateGender);
router.patch('/update-age', protect, updateAge);
router.patch('/update-menstrual-cycle', protect, updateMenstrualCycle);
router.get('/stats', protect, getUserStats);
router.post('/logout', protect, logout);

module.exports = router; 