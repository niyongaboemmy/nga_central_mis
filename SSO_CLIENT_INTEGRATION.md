# NGA Central MIS: Client SSO Integration Guide (OAuth2-style)

This documentation provides a step-by-step guide for developers to integrate their applications with the NGA Central MIS Single Sign-On (SSO) system using the **Authorization Code Flow**.

---

## ⚡ Quick Start

| Component | Value |
| :--- | :--- |
| **Provider Domain** | `https://nga-central-mis.vercel.app` |
| **API Base URL** | `https://nga-central-mis.vercel.app` |
| **Auth Type** | OAuth2-style (Authorization Code) |

---

## 🛠 Integration Steps

### 1. Register your Application
SSO Clients are registered through the **System Modules** page in the NGA Central MIS Admin Dashboard.

**How to Register:**
1.  Log in to the MIS Admin Panel with an account that has the `MANAGE_SSO_CLIENTS` permission.
2.  Navigate to **System Modules**.
3.  Click **Add Module** (or edit an existing one).
4.  Fill in the **SSO Configuration** section:
    *   **Client ID**: A unique identifier for your app (e.g., `my_portal_app`).
    *   **Allowed Redirect URIs**: Comma-separated list of valid callback URLs.
5.  Save the module. Your **Client Secret** will be displayed **once** — copy it immediately!

> [!IMPORTANT]
> Keep your **Client Secret** secure and never expose it in public code or frontend environments.

### 2. Initiate the Login Flow
When a user needs to log in to your app, redirect them to the MIS login page with your parameters:

**Redirect URL:**
```text
https://nga-central-mis.vercel.app/login?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_CALLBACK_URL
```

### 3. Handle the Callback
After successful authentication, MIS will redirect the user back to your `redirect_uri` with a one-time **Authorization Code** in the URL.

**Example Redirect back to you:**
```text
https://my-app.com/auth/callback?code=32_char_random_code
```

### 4. Exchange Code for Token (Server-Side)
From your **backend server**, exchange the code for a full JWT. 

> [!CAUTION]
> **NEVER** perform this step from the frontend. Your `client_secret` must remain hidden.

**Endpoint:** `POST https://nga-central-mis.vercel.app/sso/token`

**Request Body:**
```json
{
  "code": "CODE_FROM_STEP_3",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

### 5. Start User Session
Upon success, the API returns the user's data and a JWT.

**Response Example:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "user": {
      "user_id": 1,
      "username": "jdoe",
      "email": "jdoe@nga.ac.rw"
    },
    "permissions": ["VIEW_DASHBOARD", "MANAGE_STUFF"]
  }
}
```
You should now store this `token` in your app's session or local storage to authenticate subsequent requests.

---

## 🔒 Security & Verification (Critical)

### Where to store credentials?
| Credential | Visibility | Storage Location |
| :--- | :--- | :--- |
| **Client ID** | Public | Frontend code, URLs, or `.env` |
| **Client Secret** | **PRIVATE** | **Backend Server `.env` ONLY** |

**❌ NEVER** include the `client_secret` in your React/Vue/Mobile app code. Creating the token exchange request from the browser will expose your secret to attackers.

**✅ CORRECT way to store secrets:**
Create a `.env` file on your backend server:
```ini
# .env file
NGA_SSO_CLIENT_ID=your_client_id
NGA_SSO_CLIENT_SECRET=a3f8b2c1d4e5...
```

### How Verification Works
1.  **MIS (The Provider)** stores your secret hash in its secure database when you register.
2.  **Your Server** sends the secret during the `POST /sso/token` call.
3.  **MIS** compares the received secret against its stored record.
4.  If they match, MIS knows the request came from your authentic backend server and issues a token.

---

## 🆘 Support
For technical assistance or to register new redirect URIs, please reach out to the NGA IT Support team.
