# NGA Central MIS: SSO Integration Guide

This guide provides technical instructions for integrating external platforms with the NGA Central MIS Centralized Authentication (SSO) system.

---

## 🚀 Overview

NGA Central MIS supports two types of Single Sign-On (SSO):

1.  **Implicit SSO (Shared Domain)**: Uses HTTP-only cookies shared across subdomains (e.g., `app1.nga.ac.rw` and `api.nga.ac.rw`).
2.  **Explicit SSO (Cross-Domain)**: Uses a redirection-based flow similar to OAuth2 for systems on entirely different domains (e.g., `mysystem.com`).

---

## 🛠 Option 1: Shared Domain SSO (Same Root Domain)

This is the simplest method. If your application is hosted on a subdomain of the same root (e.g., `*.nga.ac.rw`), the authentication is handled automatically by the browser via a shared cookie.

### How it Works
1.  User logs in at `mis.nga.ac.rw`.
2.  Backend sets a secure, HTTP-only cookie `nga_auth_token` on domain `.nga.ac.rw`.
3.  Your app at `portal.nga.ac.rw` sends this cookie automatically to the API.

### Integration Steps

#### 1. Frontend Configuration
Ensure your HTTP client (e.g., Axios) is configured to send credentials:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.nga.ac.rw',
  withCredentials: true // 👈 CRITICAL: Enables cookie sharing
});

// Check session on app mount
async function initApp() {
  try {
    const res = await api.get('/auth/session');
    console.log("Logged in user:", res.data.data.user);
  } catch (err) {
    window.location.href = 'https://mis.nga.ac.rw/login';
  }
}
```

#### 2. Backend Verification (Optional)
If your app has its own backend, use `cookie-parser` to extract the token:

```javascript
const token = req.cookies.nga_auth_token;
// Verify token using the shared JWT_SECRET
```

---

## 📡 Option 2: Cross-Domain SSO (OAuth2-style)

Use this if your system is on a completely different domain. This flow uses secure redirections.

### Integration Flow

| Step | Action | Description |
| :--- | :--- | :--- |
| **1** | **Redirect** | Redirect user to `https://mis.nga.ac.rw/login?client_id=ID&redirect_uri=CALLBACK` |
| **2** | **Login** | User authenticates on NGA Central MIS. |
| **3** | **Callback** | MIS redirects back: `https://your-app.com/callback?code=AUTH_CODE` |
| **4** | **Exchange** | Your server calls `POST /sso/token` with the `code` and `client_secret`. |
| **5** | **Session** | MIS returns a JWT and user profile. |

### Token Exchange (Server-Side)

**Endpoint**: `POST https://api.nga.ac.rw/sso/token`

**Payload**:
```json
{
  "code": "CODE_FROM_URL",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

---

## 🔒 Security Requirements (Production)

To ensure this system works in production, the following is **MANDATORY**:

1.  **HTTPS**: The `nga_auth_token` cookie is marked as `Secure`. SSO will NOT work over plain HTTP.
2.  **Root Domain**: Cookie domain must be set to `.yourdomain.com` (note the leading dot) in the backend config.
3.  **CORS**: Your app's domain must be added to the `CORS_ORIGIN` list in the MIS API environment.

---

## 🧪 Testing your Integration

1.  **Local Dev**: Add `127.0.0.1 app1.local` and `127.0.0.1 api.local` to your `hosts` file to simulate subdomains.
2.  **Verify Cookie**: Open DevTools > Application > Cookies and ensure `nga_auth_token` is present after login.
3.  **Check Session**: Use `curl -b cookies.txt https://api.nga.ac.rw/auth/session` to verify the API recognizes your session.
