import { currentRealTenantOrNull } from "../tenancy/context";
import nodemailer from "nodemailer";
import config from "../config";
import logger from "./logger";
import { ServiceUnavailableError } from "../errors/CustomError";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sender identity per school (MIS-S8): the SMTP transport stays global, the display
 * name and the product name in the message come from the tenant. NGA (tenant 1) keeps
 * EMAIL_FROM_NAME and "NGA Central MIS" exactly as before.
 */
export function senderName(): string {
  const t = currentRealTenantOrNull();
  if (!t || t.isPrimary) return config.email.fromName;
  return t.name;
}
export function productName(): string {
  const t = currentRealTenantOrNull();
  if (!t || t.isPrimary) return "NGA Central MIS";
  return `${t.name} MIS`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

class EmailService {
  private transporter: nodemailer.Transporter;
  private isConnected: boolean = false;
  private lastConnectionCheck: number = 0;
  private readonly CONNECTION_CHECK_INTERVAL = 60000; // Check connection at most once per minute
  private readonly RECONNECT_MAX_RETRIES = 3;
  private readonly RECONNECT_DELAY = 2000; // 2 seconds between retries

  constructor() {
    const smtpConfig = config.email.smtp;
    const port = smtpConfig.port;
    const secure = port === 465; // SSL for 465, STARTTLS for other ports

    this.transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: port,
      secure: secure, // true for 465, false for 587
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      tls: {
        // Do not fail on invalid certificates
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000, // 10 seconds
      socketTimeout: 15000, // 15 seconds
      // Pool connections for better reliability
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
    });

    // Verify connection on startup (non-blocking)
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    const now = Date.now();
    // Throttle connection checks
    if (
      now - this.lastConnectionCheck < this.CONNECTION_CHECK_INTERVAL &&
      this.isConnected
    ) {
      return;
    }

    this.lastConnectionCheck = now;

    try {
      await this.transporter.verify();
      this.isConnected = true;
      logger.info("Email service connected successfully", {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
    } catch (error) {
      this.isConnected = false;
      logger.warn("Email service connection failed - will retry on next send", {
        error,
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
    }
  }

  /**
   * Attempt to reconnect to the email service
   */
  private async attemptReconnection(): Promise<boolean> {
    logger.info("Attempting to reconnect to email service...");

    for (let attempt = 1; attempt <= this.RECONNECT_MAX_RETRIES; attempt++) {
      try {
        await this.transporter.verify();
        this.isConnected = true;
        logger.info("Email service reconnected successfully", {
          attempt,
          host: config.email.smtp.host,
        });
        return true;
      } catch (error) {
        logger.warn(`Email service reconnection attempt ${attempt} failed`, {
          error,
        });

        if (attempt < this.RECONNECT_MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.RECONNECT_DELAY),
          );
        }
      }
    }

    this.isConnected = false;
    logger.error("Email service reconnection failed after all retries");
    return false;
  }

  /**
   * Check if email service is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Send email with error handling and automatic reconnection
   * @param options Email options
   * @param throwOnError If true, throws error on failure. If false, logs error and continues
   */
  async sendEmail(
    options: EmailOptions,
    throwOnError: boolean = true,
  ): Promise<boolean> {
    try {
      // Try to reconnect if not connected
      if (!this.isConnected) {
        logger.info("Email service not connected, attempting reconnection...");
        const reconnected = await this.attemptReconnection();
        if (!reconnected) {
          const errorMsg =
            "Email service is not connected. Skipping email send.";
          logger.warn(errorMsg, {
            to: options.to,
            subject: options.subject,
          });

          if (throwOnError) {
            throw new ServiceUnavailableError(
              "Email service is temporarily unavailable. Please try again later.",
            );
          }
          return false;
        }
      }

      const mailOptions = {
        from: `"${senderName().replace(/"/g, "")}" <${config.email.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info("Email sent successfully", {
        messageId: info.messageId,
        to: options.to,
      });
      return true;
    } catch (error: any) {
      // Mark as disconnected on error to trigger reconnection on next attempt
      this.isConnected = false;

      logger.error("Failed to send email", {
        error: error.message,
        code: error.code,
        command: error.command,
        to: options.to,
      });

      if (throwOnError) {
        throw new ServiceUnavailableError(
          "Email service is temporarily unavailable. Please try again later.",
        );
      }
      return false;
    }
  }

  async sendOTP(
    email: string,
    otp: string,
    type: "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "LOGIN_2FA",
  ): Promise<void> {
    const subjectMap = {
      LOGIN_2FA: "Your 2FA Verification Code",
      PASSWORD_RESET: "Password Reset Code",
      EMAIL_VERIFICATION: "Email Verification Code",
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${subjectMap[type]}</h2>
        <p>Hello,</p>
        <p>Your verification code is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #007bff;">${otp}</span>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <p>Best regards,<br>${esc(senderName())} Team</p>
      </div>
    `;

    const text = `
      ${subjectMap[type]}

      Hello,

      Your verification code is: ${otp}

      This code will expire in 10 minutes.

      If you didn't request this code, please ignore this email.

      Best regards,
      ${senderName()} Team
    `;

    await this.sendEmail({
      to: email,
      subject: subjectMap[type],
      html,
      text,
    });
  }

  /**
   * Send account creation email (non-blocking - won't fail if email service is down)
   */
  async sendAccountCreation(
    email: string,
    username: string,
    password: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to ${esc(productName())}</h2>
        <p>Hello,</p>
        <p>Your account has been created successfully. Here are your login credentials:</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
        </div>
        <p style="color: #d32f2f; font-weight: bold;">Important: You will be required to change your password on your first login.</p>
        <p>Please log in and update your password immediately for security reasons.</p>
        <p>If you have any questions, please contact support.</p>
        <p>Best regards,<br>${esc(senderName())} Team</p>
      </div>
    `;

    const text = `
      Welcome to ${productName()}

      Hello,

      Your account has been created successfully. Here are your login credentials:

      Username: ${username}
      Temporary Password: ${password}

      Important: You will be required to change your password on your first login.

      Please log in and update your password immediately for security reasons.

      If you have any questions, please contact support.

      Best regards,
      ${senderName()} Team
    `;

    // Don't throw error if email fails - just log and continue
    return await this.sendEmail(
      {
        to: email,
        subject: `Your ${productName()} Account Credentials`,
        html,
        text,
      },
      false,
    ); // throwOnError = false
  }
}

export default new EmailService();
