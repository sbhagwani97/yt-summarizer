# YouTube Summarizer Backend - Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add:
- `SECRET_KEY`: Random secret string for JWT signing (e.g., `openssl rand -hex 32`)
- `TOGETHER_API_KEY`: Your TogetherAI API key (get it from https://www.together.ai/)

### 3. Run the Server
```bash
uvicorn main:app --reload --port 8000
```

Server will be available at `http://localhost:8000`

## API Endpoints

### Authentication

**Register**
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response: { "token": "eyJ..." }
```

**Login**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response: { "token": "eyJ..." }
```

### Summarization

**Summarize Video**
```
POST /api/v1/summarize
Authorization: Bearer <token>
Content-Type: application/json

{
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}

Response: {
  "summary": "...",
  "highlights": ["point 1", "point 2", ...]
}
```

## Quota System

- **Free Tier**: 5 summaries per month
- **Pro Tier**: Unlimited summaries
- Returns HTTP 402 when quota exceeded

## Testing

```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Summarize (replace TOKEN with actual JWT)
curl -X POST http://localhost:8000/api/v1/summarize \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Chrome Extension Integration

Update `background/service-worker.js` in the chrome extension:
```javascript
const API_BASE = "http://localhost:8000/api/v1";
```

Update `manifest.json` host_permissions to include:
```json
"http://localhost:8000/*"
```
