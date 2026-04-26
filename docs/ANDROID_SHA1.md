# How to Get Your Android SHA-1 for Google Sign-In

You need the **SHA-1 certificate fingerprint** when creating the **Android** OAuth client in Google Cloud Console. Use the steps below.

---

## Option 1: Debug keystore (development / testing)

The debug keystore is created when you first build or run an Android app on your machine (e.g. with Android Studio or Expo).

### Step 1: Open a terminal

- **Mac:** Terminal.app or iTerm  
- **Windows:** Command Prompt or PowerShell  
- **Linux:** Any terminal

### Step 2: Run this command

**Mac / Linux:**

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

**Windows (Command Prompt):**

```cmd
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android
```

**Windows (PowerShell):**

```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android
```

### Step 3: Find SHA-1 in the output

You’ll see a block like:

```
Alias name: androiddebugkey
Creation date: ...
Entry type: PrivateKeyEntry
Certificate chain length: 1
Certificate[1]:
Owner: ...
Issuer: ...
Serial number: ...
Valid from: ... until: ...
Certificate fingerprints:
	 SHA1: AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12
	 SHA256: ...
```

**Copy the SHA-1 line only** (the hex with colons, e.g. `AB:CD:EF:12:34:...`) and paste it into the Google Cloud Console “SHA-1 certificate fingerprint” field.

---

## If the command says “keystore not found”

The file `~/.android/debug.keystore` is created when an Android app is built or run. Try one of these:

### A. Build or run your app once (Expo)

From your **frontend** folder:

```bash
npx expo run:android
```

Or create a development build. After a successful build, the debug keystore is usually created and the command in Step 2 should work.

### B. Use Android Studio

1. Open Android Studio.  
2. **Build** → **Generate Signed Bundle / APK** (or open an Android project and run it once).  
3. Or open your project’s `android` folder (e.g. after `npx expo prebuild`) in Android Studio and run the app.  
4. Then run the same `keytool` command again; the debug keystore should exist.

### C. Create the debug keystore manually (optional)

If you have Java (JDK) but no keystore yet:

**Mac / Linux:**

```bash
mkdir -p ~/.android
keytool -genkey -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000
```

Then run the **list** command from Step 2 to get the SHA-1.

---

## “keytool: command not found”

`keytool` comes with the **Java JDK**. Install a JDK (e.g. [Adoptium](https://adoptium.net/) or Oracle JDK), then run the command again. Or use the full path to `keytool` inside the JDK (e.g. `C:\Program Files\Eclipse Adoptium\jdk-17\bin\keytool.exe` on Windows).

---

## Release / production builds

For **release** (Play Store) you use a **different keystore** that you create for signing the release app. The SHA-1 from that keystore must also be added to the same Android OAuth client in Google Cloud (you can add multiple SHA-1s). Get it with:

```bash
keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
```

(Use your real keystore path and alias; you’ll be prompted for the keystore password.)

---

## Summary

1. Open terminal.  
2. Run the `keytool -list -v -keystore ...` command for `~/.android/debug.keystore` (see commands above).  
3. Copy the **SHA-1** value from the output.  
4. Paste it into Google Cloud Console → Credentials → your Android OAuth client → “SHA-1 certificate fingerprint”.
