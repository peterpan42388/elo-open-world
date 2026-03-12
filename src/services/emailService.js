import nodemailer from "nodemailer";

export class EmailService {
  constructor({
    host = process.env.EMAIL_HOST || "",
    port = Number(process.env.EMAIL_PORT || 587),
    secure = String(process.env.EMAIL_SECURE || "false") === "true",
    useTls = String(process.env.EMAIL_USE_TLS || "true") === "true",
    user = process.env.EMAIL_HOST_USER || "",
    pass = process.env.EMAIL_HOST_PASSWORD || "",
    from = process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER || ""
  } = {}) {
    this.from = from;
    this.enabled = Boolean(host && port && user && pass && from);
    this.transporter = this.enabled
      ? nodemailer.createTransport({
          host,
          port,
          secure,
          requireTLS: useTls,
          auth: { user, pass }
        })
      : null;
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

  async sendVerificationEmail({ to, displayName, verifyUrl, humanId }) {
    if (!this.enabled || !this.transporter) {
      throw new Error("email delivery is not configured on this deployment");
    }
    const template = this.verificationTemplate({ displayName, verifyUrl, humanId });
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html
    });
    return { delivered: true };
  }
}
