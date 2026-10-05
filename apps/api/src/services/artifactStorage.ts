import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config.js";

export class ArtifactStorage {
  readonly configured: boolean;
  private readonly client?: S3Client;

  constructor(private readonly config: AppConfig) {
    this.configured = config.objectStorageConfigured;
    if (this.configured) {
      this.client = new S3Client({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: config.S3_ACCESS_KEY_ID!,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY!
        }
      });
    }
  }

  async archiveRepository(projectId: string, archive: Buffer, sourceName: string) {
    if (!this.client || !this.config.S3_BUCKET) return null;
    const safeName = sourceName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "repository.zip";
    const key = `repositories/${projectId}/${Date.now()}-${safeName}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.S3_BUCKET,
      Key: key,
      Body: archive,
      ContentType: "application/zip",
      ServerSideEncryption: "AES256",
      Metadata: { projectId }
    }));
    return { provider: "s3-compatible", bucket: this.config.S3_BUCKET, key };
  }

  async health() {
    if (!this.client || !this.config.S3_BUCKET) {
      return { ok: false, configured: false, provider: "local-memory", detail: "S3-compatible object storage is not configured." };
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }));
      return { ok: true, configured: true, provider: "s3-compatible", detail: `Bucket ${this.config.S3_BUCKET} is reachable.` };
    } catch (error) {
      return { ok: false, configured: true, provider: "s3-compatible", detail: error instanceof Error ? error.message : "Object storage is unavailable." };
    }
  }
}
