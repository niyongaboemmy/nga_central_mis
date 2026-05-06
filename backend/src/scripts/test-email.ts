import emailService from "../utils/email";
import logger from "../utils/logger";

/**
 * Test email service configuration
 * Usage: npm run test-email <recipient-email>
 */
async function testEmail() {
  const recipientEmail = process.argv[2];

  if (!recipientEmail) {
    console.error("❌ Please provide a recipient email address");
    console.log("Usage: npm run test-email <recipient-email>");
    process.exit(1);
  }

  console.log("🧪 Testing email service...");
  console.log(`📧 Recipient: ${recipientEmail}\n`);

  // Check if email service is available
  if (!emailService.isAvailable()) {
    console.error("❌ Email service is not connected!");
    console.log("\nPossible issues:");
    console.log("1. Check SMTP credentials in .env file");
    console.log("2. Verify SMTP server is reachable");
    console.log("3. Check firewall/network settings");
    console.log("4. Verify SMTP port (465 for SSL, 587 for TLS)");
    process.exit(1);
  }

  console.log("✅ Email service is connected\n");

  try {
    // Test sending a simple email
    console.log("📤 Sending test email...");
    const success = await emailService.sendEmail(
      {
        to: recipientEmail,
        subject: "Test Email from NGA Central MIS",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Service Test</h2>
          <p>This is a test email from NGA Central MIS.</p>
          <p>If you received this email, your email service is configured correctly! ✅</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
        text: `
        Email Service Test
        
        This is a test email from NGA Central MIS.
        If you received this email, your email service is configured correctly!
        
        Timestamp: ${new Date().toISOString()}
      `,
      },
      true,
    );

    if (success) {
      console.log("\n✅ Test email sent successfully!");
      console.log("📬 Check your inbox at:", recipientEmail);
    } else {
      console.log("\n❌ Failed to send test email");
    }
  } catch (error: any) {
    console.error("\n❌ Error sending test email:", error.message);
    console.log("\nError details:", {
      code: error.code,
      command: error.command,
    });
  }

  process.exit(0);
}

testEmail();
