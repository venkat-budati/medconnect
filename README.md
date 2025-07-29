# MedConnect

A full-stack medicine donation and request platform.

## Tech Stack
- Node.js + Express.js
- EJS (view engine)
- MongoDB Atlas
- Cloudinary (image uploads)
- Plain CSS (no frameworks)

## Features
- User authentication (email/phone, bcrypt, session)
- Medicine donation (with image upload)
- Medicine request (track status)
- User dashboard (donations, requests)

## Setup
1. Clone the repo
2. Run `npm install`
3. Create a `.env` file (see below)
4. Run `npm start`

## .env Example
```
MONGODB_URI=your_mongodb_atlas_uri
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
SESSION_SECRET=your_session_secret
```

## Deployment
- Deploy to Render
- Set environment variables in Render dashboard