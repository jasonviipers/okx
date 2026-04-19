import "server-only";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/env";

let storageClient: S3Client | null = null;

function getMinioEndpoint() {
  const endpoint = env.MINIO_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error("MINIO_ENDPOINT is not configured.");
  }

  return endpoint;
}

function getMinioCredentials() {
  const accessKeyId = env.MINIO_ACCESS_KEY?.trim();
  const secretAccessKey = env.MINIO_SECRET_KEY?.trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("MinIO credentials are not configured.");
  }

  return {
    accessKeyId,
    secretAccessKey,
  };
}

export function getStorageClient() {
  if (!storageClient) {
    storageClient = new S3Client({
      endpoint: getMinioEndpoint(),
      region: "us-east-1",
      credentials: getMinioCredentials(),
      forcePathStyle: true,
    });
  }

  return storageClient;
}

export async function putObject(
  bucket: string,
  key: string,
  body: string | Uint8Array | Buffer,
  contentType?: string,
) {
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function putJsonObject(
  bucket: string,
  key: string,
  value: unknown,
) {
  await putObject(
    bucket,
    key,
    JSON.stringify(value, null, 2),
    "application/json",
  );
}

export async function getObjectText(bucket: string, key: string) {
  const response = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    return "";
  }

  if ("transformToString" in response.Body) {
    return response.Body.transformToString();
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}
