# 🏥 MedConnect - Medicine Donation & Request Platform

A comprehensive web application that connects medicine donors with those in need, facilitating the donation and request of medicines through a secure and user-friendly platform.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

MedConnect is a full-stack web application built with Node.js and Express that enables users to donate unused medicines and request medicines they need. The platform includes user authentication, medicine management, request handling, notifications, and a comprehensive dashboard for tracking donations and requests.

### Key Benefits
- **Reduce Medicine Waste**: Connect unused medicines with people who need them
- **Community Support**: Help those who cannot afford medicines
- **Secure Platform**: Verified users and secure transactions
- **Easy Management**: Comprehensive dashboard for tracking activities

## ✨ Features

### 🔐 Authentication & User Management
- **User Registration**: Email/phone verification with OTP
- **Secure Login**: Email or phone number authentication
- **Password Security**: Bcrypt hashing with strength validation
- **Profile Management**: Complete user profiles with address details
- **Session Management**: Secure session handling with MongoDB store

### 💊 Medicine Donation
- **Donation Form**: Easy-to-use form for medicine details
- **Image Upload**: Cloudinary integration for medicine photos
- **Category Management**: Organized medicine categories
- **Expiry Tracking**: Automatic expiry date validation
- **Status Management**: Track donation status (Available, Reserved, Donated)

### 📋 Medicine Requests
- **Request Creation**: Users can request specific medicines
- **Search & Browse**: Find available medicines by category/location
- **Request Matching**: Connect requests with available donations
- **Status Tracking**: Monitor request progress

### 📊 Dashboard & Analytics
- **Personal Dashboard**: Overview of donations and requests
- **Statistics**: Track medicines donated, received, and people helped
- **Activity History**: Complete history of all activities
- **Notifications**: Real-time updates and alerts

### 🔔 Notifications System
- **Email Notifications**: OTP and status updates via email
- **In-App Notifications**: Real-time notification system
- **Status Updates**: Automatic notifications for request/donation status changes

### 📱 Responsive Design
- **Mobile-First**: Optimized for all device sizes
- **Modern UI**: Clean, intuitive interface
- **Accessibility**: User-friendly design with proper contrast and navigation

## 🛠 Technology Stack

### Backend
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **MongoDB**: NoSQL database with Mongoose ODM
- **Express Session**: Session management with MongoDB store
- **Bcrypt**: Password hashing and comparison
- **Nodemailer**: Email service integration

### Frontend
- **EJS**: Embedded JavaScript templating
- **Express EJS Layouts**: Template layout management
- **CSS3**: Custom styling with responsive design
- **JavaScript**: Client-side interactivity
- **Font Awesome**: Icon library

### External Services
- **Cloudinary**: Image upload and storage
- **MongoDB Atlas**: Cloud database hosting
- **Nodemailer**: Email service for OTP and notifications

### Development Tools
- **Nodemon**: Development server with auto-restart
- **Dotenv**: Environment variable management
- **Method Override**: HTTP method override for forms

## 🚀 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn package manager

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd medconnect
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Environment Configuration
Create a `.env` file in the root directory:
```env
# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/medconnect
BASE_URL=hhtp://localhost:3000
# Session Configuration
SESSION_SECRET=your-super-secret-session-key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email Configuration (for OTP and notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=FALSE
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=From address
GOOGLE_MAPS_API_KEY=maps-api-key

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Step 4: Start the Application
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3000`

## ⚙️ Configuration

### Database Setup
1. **Local MongoDB**: Install and start MongoDB locally
2. **MongoDB Atlas**: Create a free cluster and get connection string
3. **Collections**: The application will automatically create required collections

### Email Service Setup
1. **Gmail**: Enable 2-factor authentication and generate app password
2. **Other Providers**: Update email configuration in `.env`
3. **Testing**: Verify email service with test OTP

### Cloudinary Setup
1. **Account Creation**: Sign up at cloudinary.com
2. **API Keys**: Get cloud name, API key, and secret
3. **Configuration**: Update `.env` with your credentials

## 📖 Usage

### User Registration
1. Visit `/auth/register`
2. Fill in personal details (name, email, phone, password)
3. Verify email with OTP
4. Complete profile with address information

### Medicine Donation
1. Login to your account
2. Navigate to "Donate Medicine"
3. Fill in medicine details:
   - Name and category
   - Expiry date
   - Quantity and condition
   - Upload medicine photo
4. Submit donation

### Medicine Requests
1. Browse available medicines
2. Create a request for needed medicine
3. Wait for donor approval
4. Track request status

### Dashboard Features
- **Overview**: Summary of donations and requests
- **My Donations**: Manage your donated medicines
- **My Requests**: Track your medicine requests
- **Notifications**: View all system notifications
- **Profile**: Update personal information

## 🔌 API Endpoints

### Authentication Routes
```
POST /auth/register          # User registration
POST /auth/login            # User login
POST /auth/logout           # User logout
POST /auth/verify-otp       # Email verification
GET  /auth/session-test     # Session debugging
```

### Donation Routes
```
GET    /donate              # Donation form
POST   /donate              # Create donation
GET    /donate/:id          # View donation
PUT    /donate/:id          # Update donation
DELETE /donate/:id          # Delete donation
```

### Request Routes
```
GET    /request             # Request form
POST   /request             # Create request
GET    /request/:id         # View request
PUT    /request/:id         # Update request
```

### Dashboard Routes
```
GET    /dashboard           # Main dashboard
GET    /dashboard/profile   # User profile
PUT    /dashboard/profile   # Update profile
GET    /dashboard/notifications # User notifications
```

## 🗄️ Database Schema

### User Model
```javascript
{
  email: String,           // User email (unique)
  phone: String,           // Phone number (unique)
  password: String,        // Hashed password
  verified: Boolean,       // Email verification status
  firstName: String,       // First name
  lastName: String,        // Last name
  username: String,        // Unique username
  addressLine1: String,    // Address line 1
  addressLine2: String,    // Address line 2
  city: String,           // City
  state: String,          // State
  country: String,        // Country
  district: String,       // District
  pincode: String,        // Postal code
  medicinesDonated: Number, // Count of donated medicines
  medicinesReceived: Number, // Count of received medicines
  peopleHelped: Number,   // Count of people helped
  averageRating: Number   // Average user rating
}
```

### Medicine Model
```javascript
{
  name: String,           // Medicine name
  category: ObjectId,     // Reference to Category
  description: String,    // Medicine description
  quantity: Number,       // Available quantity
  expiryDate: Date,       // Expiry date
  condition: String,      // Medicine condition
  image: String,          // Cloudinary image URL
  donor: ObjectId,        // Reference to User
  status: String,         // Available/Reserved/Donated
  location: {             // Location details
    city: String,
    state: String,
    coordinates: [Number, Number]
  }
}
```

### Request Model
```javascript
{
  medicine: ObjectId,     // Reference to Medicine
  requester: ObjectId,    // Reference to User
  quantity: Number,       // Requested quantity
  reason: String,         // Reason for request
  status: String,         // Pending/Approved/Rejected/Completed
  donor: ObjectId,        // Reference to donor User
  createdAt: Date,        // Request creation date
  updatedAt: Date         // Last update date
}
```

## 🚀 Deployment

### Environment Variables
Ensure all environment variables are properly configured for production:
- Database connection string
- Session secret
- Cloudinary credentials
- Email service configuration

### Security Considerations
- Use HTTPS in production
- Set secure session cookies
- Implement rate limiting
- Regular security updates

### Performance Optimization
- Enable MongoDB indexing
- Optimize image uploads
- Implement caching strategies
- Monitor application performance

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature-name`
3. **Make your changes**: Follow coding standards
4. **Test thoroughly**: Ensure all features work correctly
5. **Submit a pull request**: Provide detailed description

### Development Guidelines
- Follow existing code style
- Add comments for complex logic
- Update documentation for new features
- Test on multiple devices and browsers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🙏 Acknowledgments

- **Community Contributors**: All contributors who helped improve the platform
- **Open Source Libraries**: All the amazing open-source libraries used
- **Users**: The community using MedConnect to help others

---

**Made with ❤️ for the community**