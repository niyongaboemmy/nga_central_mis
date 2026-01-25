# NGA Central MIS: SSO Integration Guide

This guide explains how to integrate your application with the NGA Central MIS Single Sign-On (SSO) system using the standard OAuth2 Authorization Code Flow. This allows users to sign in to your application using their NGA Central MIS credentials.

## Overview

The integration follows a standard 3-legged OAuth2 flow:
1.  **Redirect**: Your app redirects the user to the MIS Login Page.
2.  **Authorize**: User logs in and approves your app (implicit in NGA MIS).
3.  **Exchange**: MIS redirects back to your callback URL with a `code`. Your server exchanges this `code` for an access `token`.

---

## 📋 Prerequisites

Before you begin, ensure you have the following:

1.  **Registered Application**: Your app must be registered in the NGA MIS Admin Dashboard (System Modules).
2.  **Credentials**: Obtain your `Client ID` and `Client Secret`.
3.  **Redirect URI**: Whitelist your callback URL (e.g., `http://localhost:5173/taskmentor/sso/callback`).

---

## ⚡ Quick Start

### 1. Configure Environment Variables

Add these variables to your project's `.env` files.

**Frontend (`client/.env`):**
```ini
# The URL for the user login interface
VITE_MIS_LOGIN_URL=https://nga.ac.rw/mis/login
# Your unique application identifier
VITE_SSO_CLIENT_ID=your_client_id
```

**Backend (`server/.env`):**
```ini
# The API base URL for token exchange
NGA_MIS_BASE_URL=https://nga-central-mis.vercel.app
# Your credentials (NEVER expose these to the client)
SSO_CLIENT_ID=your_client_id
SSO_CLIENT_SECRET=your_client_secret
```

---

## 🛠 Integration Steps

### Step 1: Redirect User to Login

When the user clicks "Sign in with NGA MIS", redirect them to the configured login URL.

**React Example:**
```tsx
const handleLogin = () => {
  const clientId = import.meta.env.VITE_SSO_CLIENT_ID;
  const loginUrl = import.meta.env.VITE_MIS_LOGIN_URL;
  const redirectUri = window.location.origin + "/your/callback/path";
  
  // Construct the full URL
  const target = `${loginUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  // Redirect
  window.location.href = target;
};
```

### Step 2: Handle the Callback

Create a route in your frontend (e.g., `/sso/callback`) to capture the authorization `code` from the URL query parameters.

**React Example:**
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (code) {
    // Send this code to YOUR backend immediately
    sendCodeToBackend(code);
  }
}, []);
```

### Step 3: Exchange Code for Token (Server-Side)

Your backend must exchange the authorization code for an access token. **This must happen on the server** to keep your `Client Secret` secure.

**Endpoint**: `POST /sso/token` (on `NGA_MIS_BASE_URL`)

**Node.js / Express Example:**
```typescript
import axios from 'axios';

async function exchangeToken(authCode) {
  try {
    const response = await axios.post(`${process.env.NGA_MIS_BASE_URL}/sso/token`, {
      code: authCode,
      client_id: process.env.SSO_CLIENT_ID,
      client_secret: process.env.SSO_CLIENT_SECRET
    });

    const { token, user, permissions } = response.data.data;
    
    // 1. Create a session for the user in your app
    // 2. return the token/session to your frontend
    return token;
    
  } catch (error) {
    console.error("Token exchange failed", error);
    throw error;
  }
}
```

### Step 4: Verify & Access Data

Once authenticated, you can use the returned `token` to access protected NGA MIS APIs on behalf of the user.

**Authorization Header:**
```http
Authorization: Bearer <your_jwt_token>
```

---

## 🐞 Troubleshooting

| Error | Possible Cause | Solution |
| :--- | :--- | :--- |
| **404 Not Found** on Redirect | Wrong Login URL | Ensure you use `https://nga.ac.rw/mis/login`, NOT the API URL. |
| **Invalid Authorization Code** | Code reused or expired | Codes are one-time use and expire in 60s. Ensure your frontend sends it only once (use `useRef` in React strict mode). |
| **JsonWebTokenError** | Stale local token | Clear `localStorage` of old tokens. Ensure your app uses the fresh cookie/token from the SSO exchange. |
| **401 Unauthorized** during exchange | Bad Secret | Check `SSO_CLIENT_SECRET` matches the one in MIS Admin. |

---

## 📚 API Reference

**Auth Base URL**: `https://nga-central-mis.vercel.app`

### `POST /sso/token`
Exchanges Authorization Code for Access Token.

**Payload:**
```json
{
  "code": "string (required)",
  "client_id": "string (required)",
  "client_secret": "string (required)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_string...",
    "user": { ... },
    "permissions": [ ... ]
  }
}
```
