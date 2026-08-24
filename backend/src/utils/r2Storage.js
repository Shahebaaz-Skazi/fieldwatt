/**
 * Cloudflare R2 storage utility.
 * Uses @aws-sdk/client-s3 with the R2 S3-compatible endpoint.
 *
 * Environment variables required:
 *   R2_ACCOUNT_ID          - Cloudflare account ID (for the endpoint URL)
 *   R2_ACCESS_KEY_ID       - R2 Access Key ID
 *   R2_SECRET_ACCESS_KEY   - R2 Secret Access Key
 *   R2_BUCKET_NAME         - R2 bucket name (e.g. meter-photos)
 *   R2_PUBLIC_BASE_URL     - Public dev URL prefix (e.g. https://pub-xxx.r2.dev)
 */
require('dotenv').config();

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ACCOUNT_ID        = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME       = process.env.R2_BUCKET_NAME || 'fieldwatt-meter-photos';
const PUBLIC_BASE_URL   = (process.env.R2_PUBLIC_BASE_URL || 'https://pub-3de6f3ace1d04d558c47c0e7df5f333d.r2.dev').replace(/\/$/, '');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a raw Buffer directly to R2.
 * Returns the public URL.
 */
async function uploadBuffer(key, buffer, contentType = 'image/jpeg') {
  await client.send(new PutObjectCommand({
    Bucket:      BUCKET_NAME,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  return `${PUBLIC_BASE_URL}/${key}`;
}

/**
 * Generate a presigned PUT URL for direct client → R2 upload (agent app flow).
 * Returns { uploadUrl, photoUrl }.
 */
async function getPresignedUploadUrl(key, contentType = 'image/jpeg', expiresInSeconds = 300) {
  const command = new PutObjectCommand({
    Bucket:      BUCKET_NAME,
    Key:         key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const photoUrl  = `${PUBLIC_BASE_URL}/${key}`;

  return { uploadUrl, photoUrl };
}

module.exports = { uploadBuffer, getPresignedUploadUrl, BUCKET_NAME, PUBLIC_BASE_URL };
