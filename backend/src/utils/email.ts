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
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || "NGA MIS"}" <${
          process.env.EMAIL_FROM || process.env.SMTP_USER
        }>`,
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
    } catch (error) {
      logger.error("Failed to send email", { error, to: options.to });
      throw new Error("Failed to send email");
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
        <p>Best regards,<br>NGA Central MIS Team</p>
      </div>
    `;

    const text = `
      ${subjectMap[type]}

      Hello,

      Your verification code is: ${otp}

      This code will expire in 10 minutes.

      If you didn't request this code, please ignore this email.

      Best regards,
      NGA Central MIS Team
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
