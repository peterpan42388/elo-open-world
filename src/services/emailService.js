import nodemailer from "nodemailer";

export class EmailService {
  constructor({
    brevoApiKey = process.env.BREVO_API_KEY || "",
    brevoSenderName = process.env.BREVO_SENDER_NAME || "",
    brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "",
    host = process.env.EMAIL_HOST || "",
    port = Number(process.env.EMAIL_PORT || 587),
    secure = String(process.env.EMAIL_SECURE || "false") === "true",
    useTls = String(process.env.EMAIL_USE_TLS || "true") === "true",
    user = process.env.EMAIL_HOST_USER || "",
    pass = process.env.EMAIL_HOST_PASSWORD || "",
    from = process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER || ""
  } = {}) {
    this.from = from;
    this.brevoApiKey = brevoApiKey;
    this.brevoSenderName = brevoSenderName || "MetaVie";
    this.brevoSenderEmail = brevoSenderEmail || from;
    this.smtpEnabled = Boolean(host && port && user && pass && from);
    this.enabled = Boolean((this.brevoApiKey && this.brevoSenderEmail) || this.smtpEnabled);
    this.transporter = this.smtpEnabled
      ? nodemailer.createTransport({
          host,
          port,
          secure,
          requireTLS: useTls,
          auth: { user, pass }
        })
      : null;
  }

  get mode() {
    if (this.brevoApiKey && this.brevoSenderEmail) return "brevo-api";
    if (this.smtpEnabled) return "smtp";
    return "disabled";
  }

  verificationTemplate({ displayName, verifyUrl, humanId }) {
    const name = displayName || humanId;
    return {
      subject: "Verify your ELO Open World email",
      text: [
        `Hello ${name},`,
        "",
        "Verify your email for ELO Open World by opening the link below:",
        verifyUrl,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#151515">
          <h2>ELO Open World Email Verification</h2>
          <p>Hello ${name},</p>
          <p>Verify your email for ELO Open World by using the button below.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#0d6b66;color:#ffffff;text-decoration:none;border-radius:10px">Verify Email</a></p>
          <p>If the button does not work, use this link:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    };
  }

  passwordResetTemplate({ displayName, resetUrl, humanId }) {
    const name = displayName || humanId;
    return {
      subject: "Reset your ELO Open World password",
      text: [
        `Hello ${name},`,
        "",
        "Reset your ELO Open World password by opening the link below:",
        resetUrl,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#151515">
          <h2>ELO Open World Password Reset</h2>
          <p>Hello ${name},</p>
          <p>Use the button below to set a new password for your ELO Open World account.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#0d6b66;color:#ffffff;text-decoration:none;border-radius:10px">Reset Password</a></p>
          <p>If the button does not work, use this link:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    };
  }

  async sendVerificationEmail({ to, displayName, verifyUrl, humanId }) {
    if (!this.enabled) {
      throw new Error("email delivery is not configured on this deployment");
    }
    const template = this.verificationTemplate({ displayName, verifyUrl, humanId });
    if (this.mode === "brevo-api") {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.brevoApiKey
        },
        body: JSON.stringify({
          sender: {
            name: this.brevoSenderName,
            email: this.brevoSenderEmail
          },
          to: [{ email: to, name: displayName || humanId }],
          subject: template.subject,
          htmlContent: template.html,
          textContent: template.text,
          tags: ["elo-open-world", "email-verification"]
        })
      });
      if (!response.ok) {
        let details = "";
        try {
          const data = await response.json();
          details = data?.message || data?.code || JSON.stringify(data);
        } catch {
          details = await response.text();
        }
        throw new Error(`brevo email send failed: ${details || response.status}`);
      }
      return { delivered: true, mode: this.mode };
    }

    if (!this.transporter) {
      throw new Error("smtp transporter is not configured on this deployment");
    }
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html
    });
    return { delivered: true, mode: this.mode };
  }

  async sendPasswordResetEmail({ to, displayName, resetUrl, humanId }) {
    if (!this.enabled) {
      throw new Error("email delivery is not configured on this deployment");
    }
    const template = this.passwordResetTemplate({ displayName, resetUrl, humanId });
    if (this.mode === "brevo-api") {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.brevoApiKey
        },
        body: JSON.stringify({
          sender: {
            name: this.brevoSenderName,
            email: this.brevoSenderEmail
          },
          to: [{ email: to, name: displayName || humanId }],
          subject: template.subject,
          htmlContent: template.html,
          textContent: template.text,
          tags: ["elo-open-world", "password-reset"]
        })
      });
      if (!response.ok) {
        let details = "";
        try {
          const data = await response.json();
          details = data?.message || data?.code || JSON.stringify(data);
        } catch {
          details = await response.text();
        }
        throw new Error(`brevo email send failed: ${details || response.status}`);
      }
      return { delivered: true, mode: this.mode };
    }

    if (!this.transporter) {
      throw new Error("smtp transporter is not configured on this deployment");
    }
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html
    });
    return { delivered: true, mode: this.mode };
  }
}
