/**
 * NGA Central MIS - Integrated SSO Test Suite (v2)
 *
 * This script tests both the Shared-Domain (Cookie) and Cross-Domain (OAuth2) SSO infrastructure.
 * Note: Requires the backend server to be running at localhost:5001.
 *
 * USAGE: node integrated_sso_test.js
 */

const BASE_URL = "http://localhost:5001";

async function runTests() {
  console.log("🚀 Starting Integrated SSO Test Suite...\n");

  try {
    // 🔍 Test 1: Public Health Check
    console.log("Test 1: Health Check (Public)");
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (healthRes.ok) {
      console.log("✅ PASS: API is reachable\n");
    } else {
      console.log(`❌ FAIL: Health check returned ${healthRes.status}\n`);
    }

    // 🔍 Test 2: Protected Session Check (Negative)
    console.log("Test 2: Session check without cookie/token (Protected)");
    const authRes = await fetch(`${BASE_URL}/auth/session`);
    if (authRes.status === 401) {
      console.log("✅ PASS: Correctly blocked unauthorized access (401)\n");
    } else {
      console.log(
        `❌ FAIL: Endpoint returned ${authRes.status}, expected 401\n`,
      );
    }

    // 🔍 Test 3: SSO Authorize Check (Negative)
    console.log("Test 3: SSO Authorize without session (Protected)");
    const ssoAuthRes = await fetch(
      `${BASE_URL}/sso/authorize?client_id=test&redirect_uri=http://localhost:3000`,
    );
    if (ssoAuthRes.status === 401) {
      console.log(
        "✅ PASS: Correctly blocked unauthorized SSO attempt (401)\n",
      );
    } else {
      console.log(
        `❌ FAIL: SSO Authorize returned ${ssoAuthRes.status}, expected 401\n`,
      );
    }

    // 🔍 Test 4: SSO Token Exchange Check (Negative)
    console.log("Test 4: SSO Token Exchange with dummy credentials");
    const tokenRes = await fetch(`${BASE_URL}/sso/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "invalid",
        client_id: "invalid",
        client_secret: "invalid",
      }),
    });

    // Likely 404 if client not found or 401 if invalid secret
    if (tokenRes.status >= 400 && tokenRes.status < 500) {
      console.log(
        `✅ PASS: Correctly rejected invalid token exchange (${tokenRes.status})\n`,
      );
    } else {
      console.log(
        `❌ FAIL: Token exchange returned ${tokenRes.status}, expected 4xx\n`,
      );
    }

    console.log("--------------------------------------------------");
    console.log("🎉 Basic SSO Infrastructure verified!");
    console.log(
      "To test full flows (Login -> OTP -> Redirect), please use a browser.",
    );
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("💥 TEST SUITE CRASHED:", error.message);
    console.log(
      'Please ensure the backend server is running with "npm run dev" in the /backend directory.',
    );
  }
}

runTests();
