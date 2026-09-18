import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

/** True when R2 credentials are present. Uploads refuse to run otherwise. */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME as string;
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  if (!client) {
    const endpoint =
      process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

/** Short-lived PUT URL for direct browser upload. Key is server-chosen. */
export async function presignedPutUrl(key: string, mimeType: string, expiresIn = 600): Promise<string | null> {
  const c = getR2Client();
  if (!c) return null;
  return getSignedUrl(
    c,
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mimeType }),
    { expiresIn },
  );
}

/** Short-lived GET URL for authorized downloads (never public). */
export async function presignedGetUrl(key: string, expiresIn = 300): Promise<string | null> {
  const c = getR2Client();
  if (!c) return null;
  return getSignedUrl(c, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn,
  });
}

export async function deleteR2Object(key: string): Promise<void> {
  const c = getR2Client();
  if (!c) return;
  await c.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function newR2Key(workspaceId: string, formId: string, fileId: string): string {
  return `workspace/${workspaceId}/form/${formId}/${fileId}`;
}
