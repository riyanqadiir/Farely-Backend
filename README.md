# Farely Backend

Node.js + Express API for Farely: auth (email/phone + OTP, Google SSO), profile (with S3 photo), and JWT.

## Setup

```bash
cp .env.example .env
# Edit .env with your MONGO_URI, JWT_SECRET, and optional Twilio/Brevo/Google/AWS keys
npm install
npm start
```

## Environment (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `GOOGLE_CLIENT_ID` | For Google SSO | OAuth client ID |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | For SMS OTP | Or use Twilio Verify with `TWILIO_VERIFY_SERVICE_SID` |
| `BREVO_API_KEY` | For email OTP / forgot password | Brevo (Sendinblue) API key |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` | For profile photo | S3 bucket for uploads |
| `FRONTEND_URL` | Optional | CORS origin |

Without Twilio/Brevo keys, in development OTP is logged to the console. Without AWS keys, profile photo upload will fail.

## API Overview

### Auth (prefix `/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/signup` | Sign up: body `fullName`, `email`, `phone`, `countryCode?`, `gender?`, `otpChannel?` (phone/email). Sends OTP. |
| POST | `/resend-otp` | Resend OTP: `identifier`, `channel`, `purpose` (signup/forgot_password). Cooldown 60s, max 5 resends then lockout. |
| POST | `/verify-otp` | Verify OTP: `identifier`, `channel`, `purpose`, `otp`. |
| POST | `/set-password` | After signup OTP: set password. Body `identifier`, `channel`, `password`, `confirmPassword`. Returns `token` + `user`. |
| POST | `/login` | Login: `loginId` (email or phone), `password`. Returns `token` + `user`. |
| POST | `/google` | Google SSO: `idToken`. Returns `token` + `user`. |
| GET | `/me` | Current user (header `Authorization: Bearer <token>`). |
| POST | `/forgot-password` | Request reset: `channel`, `identifier`. Sends OTP. Cooldown 24h per user. |
| POST | `/verify-forgot-password-otp` | Verify OTP for reset. Same body as `/verify-otp` with purpose `forgot_password`. |
| POST | `/reset-password` | Set new password: `identifier`, `channel`, `password`, `confirmPassword`, and optionally `otp` (or must have verified in last 15 min). |

### Profile (prefix `/profile`, requires `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get profile (includes `profilePhotoUrl` if S3 configured). |
| PUT | `/` | Update profile: `fullName?`, `phone?`, `email?`, `countryCode?`, `street?`, `city?`, `district?`. |
| POST | `/photo` | Upload profile photo: multipart form field `photo` (JPEG/PNG/WebP, max 5MB). |

## Practices

- **OTP**: 6-digit numeric, 10 min expiry; resend cooldown 60s; max 5 resends then 60 min lockout.
- **Passwords**: bcrypt (salt 12); min 8 chars with upper, lower, number; never returned in API.
- **JWT**: Sent in `Authorization: Bearer <token>` or cookie `token`; use `protect` middleware for protected routes.
- **Validation**: express-validator on all auth and profile inputs.
- **Errors**: Central `errorHandler` returns `{ success: false, message }` and optional `errors` array.
