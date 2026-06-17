const brevo = require("@getbrevo/brevo");

let apiInstance = null;

function getClient() {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "development") {
      console.warn("BREVO_API_KEY not set. Emails will be logged only.");
      return null;
    }
    throw new Error("BREVO_API_KEY is required for sending emails.");
  }
  if (!apiInstance) {
    apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.authentications.apiKey.apiKey = key;
  }
  return apiInstance;
}

const DEFAULT_SENDER = { name: "Farely", email: process.env.BREVO_SENDER_EMAIL || "noreply@farely.com" };

function brevoErrorDetail(err) {
  const body = err?.response?.body || err?.body;
  if (body?.message) return body.message;
  if (typeof body === "string" && body.trim()) return body.trim();
  return err?.message || "Unknown Brevo error";
}

/**
 * Send OTP email via Brevo.
 */
async function sendOtpEmail(toEmail, otp, purpose = "verification") {
  const subject = purpose === "forgot_password" ? "Reset your Farely password" : "Verify your Farely account";
  const html = `
    <p>Your verification code is: <strong>${otp}</strong></p>
    <p>It expires in 10 minutes. Do not share this code.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `;

  const client = getClient();
  if (!client) {
    console.log("[DEV] Email OTP to", toEmail, ":", otp);
    return { messageId: "dev-" + Date.now() };
  }

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;
  sendSmtpEmail.sender = DEFAULT_SENDER;
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    const data = await client.sendTransacEmail(sendSmtpEmail);
    return data;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[DEV] Brevo sendOtpEmail failed. Falling back to console OTP.");
      console.warn("[DEV] Reason:", brevoErrorDetail(err));
      if (err?.status || err?.response?.statusCode) {
        console.warn("[DEV] Brevo HTTP status:", err.status || err.response.statusCode);
      }
      console.log("[DEV] Email OTP to", toEmail, ":", otp);
      return { messageId: "dev-fallback-" + Date.now() };
    }
    throw err;
  }
}

/**
 * Send generic transactional email (e.g. password changed confirmation).
 */
async function sendTransactionalEmail(toEmail, subject, htmlContent) {
  const client = getClient();
  if (!client) {
    console.log("[DEV] Email to", toEmail, subject);
    return { messageId: "dev-" + Date.now() };
  }
  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = DEFAULT_SENDER;
  sendSmtpEmail.to = [{ email: toEmail }];
  try {
    return await client.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[DEV] Brevo sendTransactionalEmail failed. Falling back to console log.");
      console.warn("[DEV] Reason:", brevoErrorDetail(err));
      if (err?.status || err?.response?.statusCode) {
        console.warn("[DEV] Brevo HTTP status:", err.status || err.response.statusCode);
      }
      console.log("[DEV] Email to", toEmail, subject);
      return { messageId: "dev-fallback-" + Date.now() };
    }
    throw err;
  }
}

module.exports = {
  sendOtpEmail,
  sendTransactionalEmail,
};
