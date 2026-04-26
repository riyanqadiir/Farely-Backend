# APIs & Credentials Guide

This document lists **which APIs/features need credentials** and **what you need to provide** beyond the basic `.env.example` (if anything).

---

## 1. Always required (core app)

You must set these or the app will fail or be insecure.

| Variable       | Purpose                    | Where to get / what to provide |
|----------------|----------------------------|---------------------------------|
| `MONGO_URI`    | MongoDB connection         | Local: `mongodb://127.0.0.1:27017/Farely`. Cloud: MongoDB Atlas connection string. |
| `JWT_SECRET`   | Signing auth tokens        | Any long, random string (e.g. `openssl rand -hex 32`). **Never commit or share.** |

**You don’t need anything else for:**  
- App to start  
- Login/signup **logic** (except actually sending OTP – see below)  
- Protected routes and JWT auth  

---

## 2. Feature-specific credentials

These are **only needed if you use that feature**. If you don’t set them, the related API either returns an error or falls back to dev behavior (e.g. log OTP to console).

### Google Sign-In (SSO)

| Variable           | Required | Notes |
|--------------------|----------|--------|
| `GOOGLE_CLIENT_ID`   | Yes, for Google SSO (Android) | Android OAuth client’s **Client ID**. |
| `GOOGLE_IOS_CLIENT_ID` | Optional (iOS)              | iOS OAuth client’s **Client ID**. Backend accepts both so one API works for Android and iOS. |

**APIs that need it:**  
- `POST /auth/google` (body: `idToken`)

**Without it:**  
- `POST /auth/google` returns `503 - Google Sign-In is not configured.`

**Do I need two keys (Android and iOS)?**  
Yes, if your app runs on **both** Android and iOS. In Google Cloud you create **two separate OAuth clients** (one at a time): first **Android** → get a Client ID, then **iOS** → get another Client ID. You can only select one application type per client. Put the Android Client ID in `GOOGLE_CLIENT_ID` and the iOS Client ID in `GOOGLE_IOS_CLIENT_ID`; the backend accepts tokens from either.

If you only have **Android** for now: create one Android client, set `GOOGLE_CLIENT_ID`, and leave `GOOGLE_IOS_CLIENT_ID` unset.

---

**What to fill in the Google Cloud form**

**When you create an ANDROID OAuth client:**

| Field | What to put |
|-------|---------------------|
| **Name** | Any label for you (e.g. `Farely Android`). Not used by Google for validation. |
| **Package name** | Your app’s Android package name, e.g. `com.farely.app`. In Expo/React Native this is often in `app.json` under `expo.android.package` or comes from your build (e.g. `host.exp.Exponent` for Expo Go). For a custom app use something like `com.yourcompany.farely`. |
| **SHA-1 certificate fingerprint** | Required. Get it from your keystore. Debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`. Release: use the keystore you use to sign the release build. Paste the SHA-1 value (e.g. `AB:CD:EF:...`) into the form. |

There is **no** “Bundle ID”, “App Store ID”, or “Team ID” for Android — those appear only for **iOS**.

---

**When you create an iOS OAuth client:**

| Field | What to put |
|-------|---------------------|
| **Name** | Any label for you (e.g. `Farely iOS`). Not used for validation. |
| **Bundle ID** | **Required.** Your app’s iOS bundle identifier, e.g. `com.farely.app`. In Expo it’s often `expo.ios.bundleIdentifier` in `app.json`, or `host.exp.Exponent` for Expo Go. Must match exactly what your app uses. |
| **App Store ID** | **Optional.** Only needed if your app is published on the App Store. It’s the numeric ID from App Store Connect (e.g. `1234567890`). For development and testing you can **leave this blank**. |
| **Team ID** | **Optional** (Google may or may not show it). Your Apple Developer Team ID from [developer.apple.com](https://developer.apple.com) → Membership. You can leave it blank for local/testing; some flows require it for production. |

Create the Android client first if you have an Android app; then create a second credential and choose **iOS** to get the iOS Client ID.

---

**Steps summary:**  
1. [Google API Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create credentials → OAuth client ID.  
2. Configure OAuth consent screen if prompted.  
3. Choose **Android** → fill Name, Package name, SHA-1 → Create → copy **Client ID** → `GOOGLE_CLIENT_ID` in `.env`.  
4. Create **another** OAuth client → choose **iOS** → fill Name, Bundle ID (App Store ID / Team ID optional) → Create → copy **Client ID** → `GOOGLE_IOS_CLIENT_ID` in `.env`.  
5. Use the same Client IDs in your React Native Google Sign-In config (Android and iOS respectively).

**You do *not* need:** Client secret. Only the Client IDs go in `.env` and in your app.

**Frontend (React Native / Expo):**  
- The app uses `@react-native-google-signin/google-signin`. Client IDs are in `frontend/app.json` → `expo.extra` (`googleWebClientId`, `googleIosClientId`). The `iosUrlScheme` plugin config uses the reversed iOS client ID.  
- **Important:** Google Sign-In does **not** work in Expo Go (it needs native code). Use a **development build**: `npx expo prebuild && npx expo run:android` or `npx expo run:ios`.  
- Optional: If you create a separate **Web** OAuth client for Android id_token, add `GOOGLE_WEB_CLIENT_ID` to backend `.env` and use it in `app.json` extra as `googleWebClientId`.

---

### SMS OTP (phone verification)

| Variable                   | Required | Notes |
|----------------------------|----------|--------|
| `TWILIO_ACCOUNT_SID`       | Yes, for real SMS | From Twilio console. |
| `TWILIO_AUTH_TOKEN`        | Yes, for real SMS | From Twilio console. |
| `TWILIO_PHONE_NUMBER`      | If using programmable SMS | Twilio “From” number (e.g. trial number). |
| **or** `TWILIO_VERIFY_SERVICE_SID` | If using Verify API | From Twilio Verify → create a service. |

**APIs that need it:**  
- `POST /auth/signup` when user chooses **phone** for OTP (`otpChannel: "phone"`)  
- `POST /auth/forgot-password` when user uses **phone**  
- `POST /auth/resend-otp` when channel is **phone**

**Without it:**  
- In **development** (`NODE_ENV=development`): OTP is **logged to the server console** (no real SMS).  
- In **production**: sending SMS will throw (Twilio credentials not configured).

**Where to get:**  
- [Twilio](https://www.twilio.com/) → sign up (free trial works; no credit card required for trial).  
- Console: Account SID, Auth Token, and either a Phone Number (for programmable SMS) or a Verify Service SID (for Verify API).  

You don’t need any extra env vars beyond those in `.env.example` for Twilio.

---

### Email OTP & forgot password (Brevo)

| Variable             | Required | Notes |
|----------------------|----------|--------|
| `BREVO_API_KEY`      | Yes, for real email | API key (e.g. “SMTP & API” key in Brevo). |
| `BREVO_SENDER_EMAIL` | Recommended | Sender email used in “From”. **Must be a verified sender/domain in Brevo.** |

**APIs that need it:**  
- `POST /auth/signup` when user chooses **email** for OTP (`otpChannel: "email"`)  
- `POST /auth/forgot-password` when user uses **email**  
- `POST /auth/resend-otp` when channel is **email**  
- Password reset confirmation email (after successful reset)

**Without it:**  
- In **development**: OTP/email is **logged to the server console** only.  
- In **production**: sending email will throw (BREVO_API_KEY required).

**Where to get:**  
- [Brevo](https://www.brevo.com/) (formerly Sendinblue) → free tier → SMTP & API → create an API key.  
- Senders: In Brevo, add and verify the sender email (or domain) you want to use; set that in `.env` as `BREVO_SENDER_EMAIL`. If unset, code uses `noreply@farely.com` (that address must be verified in Brevo for production).

You don’t need anything else except optionally `BREVO_SENDER_EMAIL` (recommended for production).

---

### Profile photo upload (AWS S3)

| Variable                 | Required | Notes |
|--------------------------|----------|--------|
| `AWS_ACCESS_KEY_ID`      | Yes, for uploads | IAM user access key. |
| `AWS_SECRET_ACCESS_KEY`  | Yes, for uploads | IAM user secret key. |
| `AWS_S3_BUCKET`          | Yes      | Bucket name (e.g. `farely-profile-photos`). |
| `AWS_REGION`             | Optional | Default `us-east-1`. Set if bucket is in another region. |
| `AWS_S3_PUBLIC_URL`      | Optional | Override URL for profile photo (e.g. CDN). Default: public S3 URL. |

**APIs that need it:**  
- `POST /profile/photo` (multipart `photo`)

**Without it:**  
- `POST /profile/photo` will return an error (e.g. AWS credentials or bucket not set).

**Where to get:**  
- [AWS Console](https://console.aws.amazon.com/) → IAM → user with programmatic access → create access key.  
- S3 → create bucket, set CORS if needed for web; attach a policy to the IAM user so it can `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on that bucket.  

Nothing else is required beyond what’s in `.env.example` (and optionally `AWS_REGION` / `AWS_S3_PUBLIC_URL`).

---

## 3. Optional / no extra credentials

These don’t require any **additional** credentials; they’re configuration only.

| Variable        | Purpose | Default / note |
|-----------------|---------|-----------------|
| `PORT`          | Server port | `3000` |
| `NODE_ENV`      | Environment | `development` → OTP/email fallback to console if Brevo/Twilio not set. |
| `JWT_EXPIRES_IN`| Token expiry | `7d` |
| `JWT_REFRESH_EXPIRES_IN` | (Reserved for refresh tokens) | Not used by current auth. |
| `FRONTEND_URL`  | CORS origin | If set, CORS allows this origin; else `*`. |

You don’t need to provide any extra credentials for these.

---

## 4. Quick reference: “Do I need credentials for this?”

| What you want                         | Credentials needed |
|--------------------------------------|--------------------|
| App runs, DB, JWT login/signup flow   | `MONGO_URI`, `JWT_SECRET` only |
| **Google** “Sign in with Google”      | `GOOGLE_CLIENT_ID` |
| **SMS OTP** (real phone verification) | Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` or `TWILIO_VERIFY_SERVICE_SID` |
| **Email OTP** / forgot password email| `BREVO_API_KEY` (+ `BREVO_SENDER_EMAIL` recommended) |
| **Profile photo** upload              | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` |

---

## 5. Do you need anything *except* what’s in `.env.example`?

**No.** Everything the backend uses for credentials and config is covered above and in `.env.example`.

Optional additions you might want:

- **`BREVO_SENDER_EMAIL`** – Set to your verified sender in Brevo (recommended for production email).
- **`AWS_REGION`** – If your S3 bucket is not in `us-east-1`.
- **`AWS_S3_PUBLIC_URL`** – Only if you serve photos via a custom domain/CDN instead of the default S3 URL.

No other env vars or credentials are required beyond what’s listed in `.env.example` and this guide.
