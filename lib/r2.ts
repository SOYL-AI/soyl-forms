import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
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
      process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: "auto",
      maxAttempts: 2,
      requestHandler: {connectionTimeout: 5_000, requestTimeout: 8_000, socketTimeout: 8_000, throwOnRequestTimeout: true},
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
export async function presignedPutUrl(key: string, mimeType: string, sizeBytes: number, expiresIn = 600): Promise<string | null> {
  const c = getR2Client();
  if (!c) return null;
  return getSignedUrl(
    c,
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
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
  if (!c) throw new Error("Storage unavailable.");
  await c.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function newR2Key(workspaceId: string, formId: string, fileId: string): string {
  return `staging/${workspaceId}/${formId}/${fileId}`;
}

/** Freeze verified bytes under a key for which no browser has a PUT URL. */
export async function inspectAndFreezeUpload(key: string, expectedBytes: number, expectedMime: string): Promise<string> {
  const c = getR2Client();
  if (!c) throw new Error("Upload service unavailable.");
  const head = await c.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  if (head.ContentLength !== expectedBytes || head.ContentType?.split(";")[0]?.trim() !== expectedMime || !head.ETag) {
    throw new Error("Uploaded file size or type doesn't match the authorized upload.");
  }
  const sample = await c.send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: "bytes=0-4095", IfMatch: head.ETag }));
  const bytes = await sample.Body?.transformToByteArray();
  const { matchesFileType } = await import("@/lib/uploads/file-types");
  if (!bytes || !matchesFileType(bytes, expectedMime)) throw new Error("The file contents don't match its type.");
  const frozenKey = `workspace/verified/${crypto.randomUUID()}`;
  await c.send(new CopyObjectCommand({
    Bucket: bucket(), Key: frozenKey,
    CopySource: `${bucket()}/${key.split("/").map(encodeURIComponent).join("/")}`,
    CopySourceIfMatch: head.ETag,
    MetadataDirective: "REPLACE", ContentType: expectedMime,
  }));
  return frozenKey;
}
