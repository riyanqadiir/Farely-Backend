const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.AWS_S3_BUCKET;
const baseUrl = process.env.AWS_S3_PUBLIC_URL || `https://${bucket}.s3.${region}.amazonaws.com`;

let client = null;

function getS3Client() {
  if (!client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for S3.");
    }
    client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  }
  return client;
}

/**
 * Upload a file buffer to S3. Returns the key (path) to store in DB.
 */
async function uploadFile(buffer, key, contentType = "image/jpeg") {
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set.");
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Generate a unique key for profile photo: profiles/{userId}/{timestamp}.{ext}
 */
function profilePhotoKey(userId, mimeType = "image/jpeg") {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  return `profiles/${userId}/${Date.now()}.${ext}`;
}

/**
 * Get public URL for a key (if bucket is public). Otherwise use signed URL.
 */
async function getFileUrl(key, expiresIn = 3600) {
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set.");
  const s3 = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn });
  return url;
}

/**
 * Delete object from S3.
 */
async function deleteFile(key) {
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set.");
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = {
  uploadFile,
  profilePhotoKey,
  getFileUrl,
  deleteFile,
  baseUrl,
};
