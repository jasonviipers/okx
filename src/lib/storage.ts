import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

export const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT ?? "http://minio:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: env.MINIO_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
});

export const BUCKETS = {
  uploads: env.MINIO_BUCKET_UPLOADS ?? "uploads",
  exports: env.MINIO_BUCKET_EXPORTS ?? "exports",
  artifacts: "artifacts",
} as const;

export async function uploadFile(
  bucket: keyof typeof BUCKETS,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKETS[bucket],
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return key;
}

export async function getPresignedUrl(
  bucket: keyof typeof BUCKETS,
  key: string,
  expiresIn = 3600,
) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKETS[bucket], Key: key }),
    { expiresIn },
  );
}

export async function deleteFile(bucket: keyof typeof BUCKETS, key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKETS[bucket],
      Key: key,
    }),
  );
}
