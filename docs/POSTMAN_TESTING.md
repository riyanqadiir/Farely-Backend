# Testing Farely API in Postman

## 1. Start the backend

```bash
cd backend
npm start
```

Server runs at **http://localhost:3000** (or your `PORT` in `.env`).

---

## 2. Import the collection

1. Open **Postman**.
2. **Import** → **File** → select `backend/postman/Farely-API.postman_collection.json`.
3. The collection **Farely API** appears with folders: **Health**, **Auth**, **Profile**.

---

## 3. Set the base URL (if needed)

- Default is `http://localhost:3000`.
- To change: click the collection **Farely API** → **Variables** tab → set `baseUrl` (e.g. `http://localhost:3000`). Save.

---

## 4. Test order (signup → login → profile)

### A. Health check

- **Health** → **Send**.  
- You should get: `API running`.

### B. Signup (email OTP)

1. **Auth** → **Signup**.
2. Body is pre-filled. Change `email` to your real email if you want to receive OTP.
3. Keep `otpChannel`: `"email"` (or use `"phone"` if Twilio is set).
4. **Send**. You should get `"success": true` and "OTP sent".
5. Check your email (or server console in dev if Brevo isn’t configured) for the 6-digit OTP.

### C. Verify OTP

1. **Auth** → **Verify OTP**.
2. Set `identifier` to the same email (or phone) you used in Signup.
3. Set `otp` to the 6-digit code you received.
4. **Send**. You should get "OTP verified".

### D. Set password

1. **Auth** → **Set Password**.
2. Same `identifier` and `channel` as above.
3. Set `password` and `confirmPassword` (e.g. `TestPass123` – must have upper, lower, number, min 8 chars).
4. **Send**. Response includes `token`. The collection script saves it to the `token` variable.

### E. Get current user (protected)

1. **Auth** → **Get Me**.
2. **Send**. Uses saved `token` in `Authorization: Bearer {{token}}`. You should get your user object.

### F. Login (existing user)

1. **Auth** → **Login**.
2. `loginId` = email or phone, `password` = the one you set.
3. **Send**. Token is saved again; you can now use **Get Me** and **Profile** requests.

### G. Profile

1. **Profile** → **Get Profile** → **Send**. Should return profile (and `profilePhotoUrl` if set).
2. **Profile** → **Update Profile** → edit body → **Send**.
3. **Profile** → **Upload Profile Photo** → in **Body** choose **form-data** → key `photo`, type **File** → choose an image → **Send**.

---

## 5. Forgot password flow

1. **Auth** → **Forgot Password** → body: `channel`, `identifier` (email or phone) → **Send**.
2. **Auth** → **Verify Forgot Password OTP** → body: same `identifier`, `channel`, `purpose`: `"forgot_password"`, `otp` from email/SMS → **Send**.
3. **Auth** → **Reset Password** → body: `identifier`, `channel`, `password`, `confirmPassword`, and optionally `otp` → **Send**. New token is saved.

---

## 6. Common issues

| Issue | Check |
|-------|--------|
| Connection refused | Backend running? Correct `baseUrl` (e.g. `http://localhost:3000`)? |
| 401 on Get Me / Profile | Run **Login** or **Set Password** first so `token` is set. In **Profile** requests, header must be `Authorization: Bearer {{token}}`. |
| 400 validation errors | See response `errors` array. Example: password needs upper, lower, number, 8+ chars; `confirmPassword` must match `password`. |
| OTP not received | Email: check Brevo and `BREVO_SENDER_EMAIL`. Phone: check Twilio Verify. In dev, OTP may be logged in the backend console. |

---

## 7. Quick reference

| Method | Path | Auth | Purpose |
|--------|------|------|--------|
| GET | `/` | No | Health |
| POST | `/auth/signup` | No | Send OTP |
| POST | `/auth/resend-otp` | No | Resend OTP |
| POST | `/auth/verify-otp` | No | Verify OTP |
| POST | `/auth/set-password` | No | Set password after signup (returns token) |
| POST | `/auth/login` | No | Login (returns token) |
| GET | `/auth/me` | Bearer | Current user |
| POST | `/auth/google` | No | Google SSO (returns token) |
| POST | `/auth/forgot-password` | No | Request reset OTP |
| POST | `/auth/verify-forgot-password-otp` | No | Verify reset OTP |
| POST | `/auth/reset-password` | No | Set new password (returns token) |
| GET | `/profile` | Bearer | Get profile |
| PUT | `/profile` | Bearer | Update profile |
| POST | `/profile/photo` | Bearer | Upload photo (form-data: photo) |
