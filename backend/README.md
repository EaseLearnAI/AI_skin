# AI Skincare System Backend

A Node.js/Express backend API for an AI-based skincare recommendation system.

## Features

- User registration and authentication using JWT
- RESTful API design
- MongoDB database with Mongoose ORM
- Comprehensive error handling and input validation
- Proper security measures (password hashing, protected routes)

## Prerequisites

- Node.js (v14.x or higher)
- MongoDB (running on localhost:27017 or configured via environment variables)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd AI_skin_backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/aiskin
JWT_SECRET=your_very_secure_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=7d
```

## Running the Application

### Development Mode

```bash
npm run dev
```

This will start the server with nodemon, which automatically restarts on file changes.

### Production Mode

```bash
npm start
```

## API Documentation

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for detailed API documentation.

## Running Tests

```bash
npm test
```

This will run the Jest test suite.

## Project Structure

```
.
├── config/             # Configuration files
├── controllers/        # Route controllers
├── middleware/         # Custom middleware
├── models/             # Mongoose models
├── routes/             # API routes
├── tests/              # Tests
├── utils/              # Utility functions
├── .env                # Environment variables
├── .gitignore          # Git ignore file
├── package.json        # Project manifest
├── README.md           # Project documentation
└── server.js           # Main application file
```

## Security Measures

- Password hashing using bcrypt
- JWT authentication for protected routes
- Input validation and sanitization
- Proper error handling
- CORS protection

## License

ISC

## Author

[Your Name] 