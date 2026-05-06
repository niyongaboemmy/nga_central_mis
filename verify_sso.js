const axios = require("axios");
const http = require("http");

const BASE_URL = "http://localhost:5001";

async function verifyAuth() {
  console.log("Testing Centralized Auth...");

  try {
    // 1. Check health
    const health = await axios.get(`${BASE_URL}/health`);
    console.log("✅ Health check passed");

    // 2. Test GET /auth/session without cookies
    try {
      await axios.get(`${BASE_URL}/auth/session`);
      console.log(
        "❌ Auth test failed: should have returned 401 without nga_auth_token cookie",
      );
    } catch (err) {
      if (err.response?.status === 401) {
        console.log("✅ Auth check without cookie correctly returned 401");
      } else {
        throw err;
      }
    }

    console.log("\nNOTE: To fully test, real credentials and OTP are needed.");
    console.log(
      "This script verified the existence of the /auth/session endpoint and its basic protection.",
    );
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

// Only run if the server is likely up (checking localhost:5001)
const req = http
  .get(`${BASE_URL}/`, (res) => {
    verifyAuth();
  })
  .on("error", (e) => {
    console.log("⚠️ Backend server not reachable at http://localhost:5001");
    console.log(
      'Please start the backend server with "npm run dev" to run the verification script.',
    );
  });
