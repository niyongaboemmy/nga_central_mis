import nodemailer from "nodemailer";
import config from "../config";
import logger from "./logger";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

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

    // Verify connection on startup
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info("Email service connected successfully", {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
    } catch (error) {
      logger.warn("Email service connection failed", { error });
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
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
    } catch (error: any) {
      logger.error("Failed to send email", {
        error: error.message,
        code: error.code,
        command: error.command,
        to: options.to,
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendOTP(
    email: string,
    otp: string,
    type: "LOGIN_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "LOGIN_2FA"
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
}

export default new EmailService();
