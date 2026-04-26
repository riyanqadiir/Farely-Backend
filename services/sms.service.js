const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const twilioSmsEnabled = process.env.ENABLE_TWILIO_SMS === "true";
const twilioVerifyEnabled = process.env.ENABLE_TWILIO_VERIFY === "true";

/**
 * Send OTP via Twilio Verify API (recommended) or Programmable SMS.
 * In development without credentials, logs OTP to console.
 */
async function sendOtpSms(phoneNumber, otp) {
  const to = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  if (!twilioSmsEnabled) {
    console.log("[SMS DISABLED] OTP to", to, ":", otp);
    return { sid: "sms-disabled-" + Date.now() };
  }

  if (!accountSid || !authToken) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      console.log("[DEV] SMS OTP to", to, ":", otp);
      return { sid: "dev-" + Date.now() };
    }
    throw new Error("Twilio credentials not configured for SMS.");
  }

  // Option 1: Twilio Verify API – no phone number needed; Twilio sends and validates the code
  if (twilioVerifyEnabled && verifyServiceSid && !twilioPhone) {
    const client = twilio(accountSid, authToken);
    await client.verify.v2.services(verifyServiceSid).verifications.create({
      to,
      channel: "sms",
    });
    return { sid: "verify", channel: "twilio-verify" };
  }

  // Option 2: Programmable SMS (we send our own OTP; requires TWILIO_PHONE_NUMBER)
  if (twilioPhone) {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: `Your Farely verification code is: ${otp}. Valid for 10 minutes.`,
      from: twilioPhone,
      to,
    });
    return { sid: message.sid };
  }

  // Fallback: dev log
  console.log("[DEV] SMS OTP to", to, ":", otp);
  return { sid: "dev-" + Date.now() };
}

/**
 * Twilio Verify API: start verification (sends SMS with Twilio-generated code).
 * Use this if you want Twilio to generate and send the OTP.
 */
async function startVerifySms(phoneNumber) {
  const to = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
  if (!twilioVerifyEnabled) {
    return { status: "pending", sid: "verify-disabled-" + Date.now() };
  }
  if (!verifyServiceSid || !accountSid || !authToken) {
    if (process.env.NODE_ENV === "development") {
      console.log("[DEV] Verify start for", to);
      return { status: "pending", sid: "dev-" + Date.now() };
    }
    throw new Error("Twilio Verify not configured.");
  }
  const client = twilio(accountSid, authToken);
  const verification = await client.verify.v2
    .services(verifyServiceSid)
    .verifications.create({ to, channel: "sms" });
  return { status: verification.status, sid: verification.sid };
}

/**
 * Twilio Verify API: check code (when using Twilio-generated OTP).
 */
async function checkVerifySms(phoneNumber, code) {
  const to = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
  if (!twilioVerifyEnabled) {
    if (String(code).trim() === "123456") return { status: "approved" };
    return { status: "denied" };
  }
  if (!verifyServiceSid || !accountSid || !authToken) {
    if (process.env.NODE_ENV === "development" && code === "123456") {
      return { status: "approved" };
    }
    throw new Error("Twilio Verify not configured.");
  }
  const client = twilio(accountSid, authToken);
  const check = await client.verify.v2
    .services(verifyServiceSid)
    .verificationChecks.create({ to, code });
  return { status: check.status };
}

module.exports = {
  sendOtpSms,
  startVerifySms,
  checkVerifySms,
};
