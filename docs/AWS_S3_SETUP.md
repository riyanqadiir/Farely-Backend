# AWS S3 Setup for Farely Profile Photos (Step-by-Step)

This guide walks you through creating an S3 bucket, a policy, an IAM user, and getting the keys for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET`.

---

## Prerequisites

- An [AWS account](https://aws.amazon.com) (free tier is enough).
- Logged in to the [AWS Console](https://console.aws.amazon.com).

---

## Step 1: Create an S3 bucket

1. In the AWS Console, open **S3** (search “S3” in the top search bar).
2. Click **Create bucket**.
3. **Bucket name:** Choose a globally unique name, e.g. `farely-profile-photos-yourname` (replace `yourname` with something unique).
4. **AWS Region:** Pick one, e.g. `us-east-1` (N. Virginia). Remember it for `AWS_REGION` in `.env`.
5. **Block Public Access:**  
   - Leave **Block all public access** **checked** (we use signed URLs; the bucket stays private).  
   - Click **I acknowledge that the current settings might result in this bucket and the objects within it becoming public** if shown.
6. Leave other options as default. Click **Create bucket**.

**Note:** Your bucket name → use as `AWS_S3_BUCKET` in `.env`.  
Your region → use as `AWS_REGION` in `.env`.

---

## Step 2: (Optional) Set CORS on the bucket

Only needed if the **browser** will upload directly to S3. For Farely, the backend uploads, so you can skip this. If you add direct browser uploads later:

1. Open your bucket → **Permissions** tab.
2. Scroll to **Cross-origin resource sharing (CORS)** → **Edit**.
3. Use something like (replace `https://yourapp.com` with your frontend origin or `*` for dev):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["https://yourapp.com", "http://localhost:8081"],
    "ExposeHeaders": []
  }
]
```

4. Save. For backend-only uploads you can leave CORS empty.

---

## Step 3: Create an IAM user for the app

1. In the AWS Console, open **IAM** (search “IAM”).
2. Left menu → **Users** → **Create user**.
3. **User name:** e.g. `farely-backend-s3`.
4. Click **Next**.
5. **Set permissions:** Choose **Attach policies directly** (we’ll add a custom policy in the next step).  
   - Do **not** attach `AdministratorAccess`.  
   - Click **Next** → **Create user**.

---

## Step 4: Create a policy that allows only what the app needs

1. In IAM, left menu → **Policies** → **Create policy**.
2. Open the **JSON** tab and **replace** the default with the policy below.  
   **Replace `YOUR_BUCKET_NAME`** with your actual bucket name (e.g. `farely-profile-photos-yourname`).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FarelyProfilePhotos",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

3. Click **Next**.
4. **Policy name:** e.g. `FarelyS3ProfilePhotos`.
5. **Description (optional):** e.g. `Allow Farely backend to upload, read, and delete profile photos in one bucket`.
6. Click **Create policy**.

---

## Step 5: Attach the policy to the user

1. IAM → **Users** → click the user you created (e.g. `farely-backend-s3`).
2. **Permissions** tab → **Add permissions** → **Attach policies directly**.
3. Search for your policy name (e.g. `FarelyS3ProfilePhotos`), select it, then **Add permissions**.

---

## Step 6: Create access keys (get your keys)

1. IAM → **Users** → click the user (e.g. `farely-backend-s3`).
2. **Security credentials** tab.
3. Scroll to **Access keys** → **Create access key**.
4. **Use case:** choose **Application running outside AWS** (or “Command Line Interface” if the other isn’t there) → **Next**.
5. (Optional) Add a description tag, e.g. `Farely backend` → **Next**.
6. **Create access key**.
7. You’ll see:
   - **Access key ID** (e.g. `AKIA...`) → this is `AWS_ACCESS_KEY_ID`.
   - **Secret access key** (shown once) → this is `AWS_SECRET_ACCESS_KEY`.  
   Copy both somewhere safe; you won’t see the secret again.
8. Click **Done**.

---

## Step 7: Put the values in your `.env`

In your project’s **`backend/.env`** (not `.env.example`), set:

```env
# AWS S3 (profile photos)
AWS_ACCESS_KEY_ID=AKIA...your-access-key-id...
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=farely-profile-photos-yourname
```

- **AWS_ACCESS_KEY_ID** = the Access key ID from Step 6.  
- **AWS_SECRET_ACCESS_KEY** = the Secret access key from Step 6.  
- **AWS_REGION** = the region where you created the bucket (e.g. `us-east-1`).  
- **AWS_S3_BUCKET** = the exact bucket name from Step 1.

Restart your backend after changing `.env`.

---

## Quick checklist

| Step | What you did | What goes in `.env` |
|------|----------------|---------------------|
| 1 | Created S3 bucket | `AWS_S3_BUCKET` = bucket name, `AWS_REGION` = region |
| 2 | (Optional) CORS | — |
| 3 | Created IAM user | — |
| 4 | Created policy (PutObject, GetObject, DeleteObject on bucket) | — |
| 5 | Attached policy to user | — |
| 6 | Created access key for user | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |

---

## Security notes

- Never commit `.env` or put real keys in `.env.example`.
- The policy above only allows access to **objects inside your bucket** (`Resource": "arn:aws:s3:::BUCKET_NAME/*"`), not other buckets or services.
- If the key is ever exposed, go to IAM → Users → that user → Security credentials → **Delete** the access key and create a new one, then update `.env`.

---

## Troubleshooting

- **Access Denied when uploading:**  
  - Bucket name in `.env` must match exactly (case-sensitive).  
  - Policy `Resource` must use your bucket name and `/*`.  
  - Policy must be attached to the user whose keys you use.

- **Wrong region:**  
  - `AWS_REGION` must be the region where the bucket was created (e.g. `us-east-1`).

- **Key not found:**  
  - Ensure there are no extra spaces or quotes around values in `.env`.
