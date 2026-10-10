import { unzipSync } from "fflate";
import { inferLanguage, isRepositoryTextFile, normalizePath } from "@codemesh/code-intelligence";
import {
  ZIP_EXTRACTED_LIMIT_BYTES,
  ZIP_EXTRACTED_LIMIT_MB,
  ZIP_UPLOAD_LIMIT_BYTES,
  ZIP_UPLOAD_LIMIT_MB,
  type RepoFile,
  type ZipValidationResult
} from "@codemesh/shared";

const MAX_FILES = 10_000;
const MAX_NESTING = 16;

export type ZipImportLimits = {
  compressedBytes: number;
  extractedBytes: number;
  files: number;
  nesting: number;
};

export const ZIP_IMPORT_LIMITS: ZipImportLimits = {
  compressedBytes: ZIP_UPLOAD_LIMIT_BYTES,
  extractedBytes: ZIP_EXTRACTED_LIMIT_BYTES,
  files: MAX_FILES,
  nesting: MAX_NESTING
};

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".class",
  ".o",
  ".a",
  ".bin",
  ".iso",
  ".sqlite",
  ".db",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".wav",
  ".flac",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".xlsx",
  ".xls",
  ".docx",
  ".pptx"
]);

const sensitiveNames = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$)/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^(credentials?|secrets?)(\.[^.]+)?$/i
];

export function validateZipArchive(buffer: Buffer, limits: ZipImportLimits = ZIP_IMPORT_LIMITS): ZipValidationResult {
  const errors: string[] = [];
  const files: Array<{ path: string; size: number; language: string }> = [];

  if (buffer.byteLength > limits.compressedBytes) {
    return {
      accepted: false,
      files: [],
      errors: [`ZIP is too large. The compressed upload limit is ${ZIP_UPLOAD_LIMIT_MB} MB.`]
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    let entries = 0, advertisedBytes = 0;
    const seen = new Set<string>();
    // Inspect central-directory metadata without inflating entries before enforcing budgets.
    unzipSync(buffer, { filter: (entry) => {
      entries++; advertisedBytes += entry.originalSize;
      const path = normalizePath(entry.name);
      if (/^[\\/]|^[a-z]:/i.test(entry.name) || entry.name.includes("\0") || /(^|\/)\.\.(\/|$)/.test(path)) errors.push("Path traversal or unsafe absolute path is not allowed.");
      if (path.split("/").length > limits.nesting) errors.push("ZIP contains a path nested too deeply.");
      if (seen.has(path)) errors.push("ZIP contains duplicate normalized paths.");
      seen.add(path);
      return false;
    } });
    if (entries > limits.files) errors.push(`ZIP has too many files. Limit is ${limits.files}.`);
    if (advertisedBytes > limits.extractedBytes) errors.push(`ZIP extracts to too much data. The extracted limit is ${ZIP_EXTRACTED_LIMIT_MB} MB.`);
    if (errors.length) return { accepted: false, files: [], errors: [...new Set(errors)] };
    unzipped = unzipSync(buffer, { filter: (entry) => !entry.name.endsWith("/") && !isSensitivePath(entry.name) && !binaryExtensions.has(extension(entry.name)) && isRepositoryTextFile(entry.name, entry.originalSize) });
  } catch {
    return { accepted: false, files: [], errors: ["Could not read ZIP archive."] };
  }

  let extractedBytes = 0;
  const entries = Object.entries(unzipped);
  if (entries.length > limits.files) {
    errors.push(`ZIP has too many files. Limit is ${limits.files}.`);
  }

  for (const [rawPath, data] of entries) {
    const safePath = normalizePath(rawPath);
    extractedBytes += data.byteLength;
    if (rawPath.includes("\0")) errors.push(`Unsafe null byte in path: ${rawPath}`);
    if (safePath.startsWith("../") || safePath.includes("/../") || rawPath.match(/^[a-z]:/i)) {
      errors.push(`Path traversal is not allowed: ${rawPath}`);
    }
    if (safePath.split("/").length > limits.nesting) {
      errors.push(`Path is nested too deeply: ${safePath}`);
    }
    if (rawPath.endsWith("/") || isSensitivePath(safePath)) continue;
    const ext = extension(safePath);
    if (binaryExtensions.has(ext)) continue;
    if (!isRepositoryTextFile(safePath, data.byteLength) || hasBinaryMarker(data)) continue;
    if (!files.some((file) => file.path === safePath)) {
      files.push({ path: safePath, size: data.byteLength, language: inferLanguage(safePath) });
    }
  }

  if (extractedBytes > limits.extractedBytes) {
    errors.push(`ZIP extracts to too much data. The extracted limit is ${ZIP_EXTRACTED_LIMIT_MB} MB.`);
  }

  return { accepted: errors.length === 0, files, errors };
}

export type ExtractRepoFilesOptions = {
  stripCommonRoot?: boolean;
};

export function extractRepoFiles(projectId: string, buffer: Buffer, options: ExtractRepoFilesOptions = {}): RepoFile[] {
  const validation = validateZipArchive(buffer);
  if (!validation.accepted) {
    throw new Error(validation.errors.join("; "));
  }
  const accepted = new Set(validation.files.map((file) => file.path));
  const unzipped = unzipSync(buffer, { filter: (entry) => accepted.has(normalizePath(entry.name)) });
  const now = new Date().toISOString();
  const acceptedPaths = Object.keys(unzipped).map(normalizePath).filter((filePath) => accepted.has(filePath));
  const commonRoot = options.stripCommonRoot ? findCommonArchiveRoot(acceptedPaths) : null;
  return Object.entries(unzipped)
    .map(([rawPath, data]) => {
      const safePath = normalizePath(rawPath);
      return { safePath, data };
    })
    .filter(({ safePath }) => accepted.has(safePath))
    .map(({ safePath, data }) => {
      const content = new TextDecoder("utf-8", { fatal: false }).decode(data);
      const path = commonRoot ? safePath.slice(commonRoot.length + 1) : safePath;
      return {
        projectId,
        path,
        language: inferLanguage(path),
        size: data.byteLength,
        binary: false,
        sensitive: false,
        content,
        updatedAt: now
      };
    });
}

function findCommonArchiveRoot(paths: string[]) {
  if (paths.length === 0) return null;
  const [root] = paths[0]!.split("/");
  if (!root || paths.some((filePath) => !filePath.startsWith(`${root}/`))) return null;
  return root;
}

function hasBinaryMarker(data: Uint8Array) {
  const sample = data.subarray(0, Math.min(data.byteLength, 8192));
  if (sample.includes(0)) return true;
  let controls = 0;
  for (const byte of sample) {
    if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9 && byte !== 10 && byte !== 13) controls += 1;
  }
  return controls > 4 && controls / Math.max(1, sample.length) > 0.02;
}

function extension(filePath: string) {
  const match = filePath.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function isSensitivePath(filePath: string) {
  const fileName = filePath.split("/").pop() ?? filePath;
  return sensitiveNames.some((pattern) => pattern.test(fileName));
}
