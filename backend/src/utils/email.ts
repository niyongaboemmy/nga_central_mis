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

class EmailService {
  private transporter: nodemailer.Transporter;
  private isConnected: boolean = false;

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
    });

    // Verify connection on startup (non-blocking)
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      this.isConnected = true;
      logger.info("Email service connected successfully", {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
    } catch (error) {
      this.isConnected = false;
      logger.warn("Email service connection failed - emails will not be sent", {
        error,
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
    }
  }

  /**
   * Check if email service is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Send email with error handling
   * @param options Email options
   * @param throwOnError If true, throws error on failure. If false, logs error and continues
   */
  async sendEmail(
    options: EmailOptions,
    throwOnError: boolean = true,
  ): Promise<boolean> {
    try {
      // Check if service is available
      if (!this.isConnected) {
        const errorMsg = "Email service is not connected. Skipping email send.";
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

      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.from}>`,
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
        <p>Best regards,<br>${config.email.fromName} Team</p>
      </div>
    `;

    const text = `
      ${subjectMap[type]}

      Hello,

      Your verification code is: ${otp}

      This code will expire in 10 minutes.

      If you didn't request this code, please ignore this email.

      Best regards,
      ${config.email.fromName} Team
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
        <h2 style="color: #333;">Welcome to NGA Central MIS</h2>
        <p>Hello,</p>
        <p>Your account has been created successfully. Here are your login credentials:</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
        </div>
        <p style="color: #d32f2f; font-weight: bold;">Important: You will be required to change your password on your first login.</p>
        <p>Please log in and update your password immediately for security reasons.</p>
        <p>If you have any questions, please contact support.</p>
        <p>Best regards,<br>${config.email.fromName} Team</p>
      </div>
    `;

    const text = `
      Welcome to NGA Central MIS

      Hello,

      Your account has been created successfully. Here are your login credentials:

      Username: ${username}
      Temporary Password: ${password}

      Important: You will be required to change your password on your first login.

      Please log in and update your password immediately for security reasons.

      If you have any questions, please contact support.

      Best regards,
      ${config.email.fromName} Team
    `;

    // Don't throw error if email fails - just log and continue
    return await this.sendEmail(
      {
        to: email,
        subject: "Your NGA Central MIS Account Credentials",
        html,
        text,
      },
      false,
    ); // throwOnError = false
  }
}

export default new EmailService();
