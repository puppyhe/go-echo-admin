import { ApiError, request, session, sessionHeaders, type UploadedFile } from '../../api/request';

export interface MultipartCapabilities {
  maxFileSize: number;
  partSize: number;
  multipartEnabled: boolean;
  maxParts: number;
  expiresHours: number;
}

export interface MultipartPart {
  part: number;
  size: number;
  hash?: string;
}

export interface MultipartSession {
  id?: string;
  uploadId: string;
  name: string;
  size: number;
  chunkSize: number;
  totalParts: number;
  expiresAt?: string;
  status: string;
  received?: number;
  parts?: MultipartPart[];
}

export interface MultipartProgress {
  uploadedBytes: number;
  totalBytes: number;
  part: number;
  totalParts: number;
}

export interface MultipartUploadOptions {
  capabilities?: MultipartCapabilities;
  uploadId?: string;
  onProgress?: (progress: MultipartProgress) => void;
  onSession?: (session: MultipartSession) => void;
}

export class UploadPausedError extends Error {
  constructor() {
    super('上传已暂停');
    this.name = 'UploadPausedError';
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super('上传已取消');
    this.name = 'UploadCancelledError';
  }
}

export async function getUploadCapabilities(): Promise<MultipartCapabilities> {
  return request<MultipartCapabilities>('/v1/files/capabilities');
}

export async function getMultipartSession(uploadId: string): Promise<MultipartSession> {
  return request<MultipartSession>(`/v1/files/multipart/${encodeURIComponent(uploadId)}`);
}

export async function abortMultipartUpload(uploadId: string): Promise<void> {
  await request(`/v1/files/multipart/${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
}

type UploadResponse<T> = { code?: number; msg?: string; data?: T } & Partial<T>;

function responseData<T>(value: UploadResponse<T>): T {
  if (value && typeof value === 'object' && 'code' in value) {
    if (typeof value.code === 'number' && value.code !== 0 && value.code !== 7) {
      throw new ApiError(value.code, value.msg || '上传请求失败');
    }
    return (value.data ?? value) as T;
  }
  return value as T;
}

function normalizeFile(value: unknown, fallback: File): UploadedFile {
  const raw =
    value && typeof value === 'object' && 'file' in value
      ? ((value as { file?: UploadedFile }).file ?? value)
      : value;
  const item = (raw || {}) as UploadedFile & { id?: number };
  return {
    ...item,
    ID: Number(item.ID ?? item.id ?? 0),
    name: item.name || fallback.name,
    url: item.url || '',
  };
}

interface PartRequest {
  uploadId: string;
  part: number;
  blob: Blob;
  scope: ReturnType<typeof session.capture>;
  onProgress: (loaded: number) => void;
  setActive: (xhr: XMLHttpRequest | null) => void;
}

function putPart({
  uploadId,
  part,
  blob,
  scope,
  onProgress,
  setActive,
}: PartRequest): Promise<MultipartPart> {
  return new Promise((resolve, reject) => {
    if (!session.isCurrent(scope)) {
      reject(new ApiError(-2, '租户已切换，上传已取消'));
      return;
    }
    const xhr = new XMLHttpRequest();
    setActive(xhr);
    xhr.open('PUT', `/api/v1/files/multipart/${encodeURIComponent(uploadId)}/parts/${part}`);
    Object.entries(sessionHeaders(scope)).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new ApiError(-1, '网络请求失败，请检查网络连接'));
    xhr.onabort = () => reject(new UploadPausedError());
    xhr.onload = () => {
      setActive(null);
      const newToken = xhr.getResponseHeader('new-token');
      if (newToken) session.setToken(newToken);
      if (!session.isCurrent(scope)) {
        reject(new ApiError(-2, '租户已切换，上传已取消'));
        return;
      }
      if (xhr.status === 401) {
        session.clear();
        reject(new ApiError(401, '登录状态已失效，请重新登录'));
        return;
      }
      let parsed: UploadResponse<MultipartPart> = {};
      try {
        parsed = xhr.responseText
          ? (JSON.parse(xhr.responseText) as UploadResponse<MultipartPart>)
          : {};
      } catch {
        reject(new ApiError(xhr.status || 500, '上传响应格式无效'));
        return;
      }
      if (
        xhr.status < 200 ||
        xhr.status >= 300 ||
        (typeof parsed.code === 'number' && parsed.code !== 0 && parsed.code !== 7)
      ) {
        reject(new ApiError(xhr.status || 500, parsed.msg || '分片上传失败'));
        return;
      }
      onProgress(blob.size);
      resolve(responseData(parsed));
    };
    xhr.send(blob);
  });
}

/** A resumable upload with pause/resume/cancel controls and per-part progress. */
export interface MultipartUploadHandle {
  promise: Promise<UploadedFile>;
  uploadId?: string;
  pause: () => void;
  resume: () => void;
  cancel: () => Promise<void>;
}

export function startMultipartUpload(
  file: File,
  options: MultipartUploadOptions = {},
): MultipartUploadHandle {
  let paused = false;
  let cancelled = false;
  let active: XMLHttpRequest | null = null;
  let wake: (() => void) | undefined;
  let uploadId = options.uploadId;
  let latestSession: MultipartSession | undefined;
  let abortSent = false;

  const waitIfPaused = async () => {
    while (paused && !cancelled) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    if (cancelled) throw new UploadCancelledError();
  };

  const promise = (async () => {
    const scope = session.capture();
    const capabilities = options.capabilities ?? (await getUploadCapabilities());
    if (!capabilities.multipartEnabled) throw new ApiError(-1, '当前环境不支持分片上传');
    if (file.size > capabilities.maxFileSize)
      throw new ApiError(
        -1,
        `文件大小不能超过 ${Math.ceil(capabilities.maxFileSize / 1024 / 1024)} MB`,
      );
    const chunkSize = Math.max(1, capabilities.partSize);
    if (!uploadId) {
      const created = responseData(
        await request<UploadResponse<MultipartSession>>('/v1/files/multipart/initiate', {
          method: 'POST',
          body: {
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            chunkSize,
            totalParts: Math.max(1, Math.ceil(file.size / chunkSize)),
          },
        }),
      );
      latestSession = created;
      uploadId = created.uploadId || created.id;
    } else {
      latestSession = await getMultipartSession(uploadId);
    }
    if (!uploadId || !latestSession) throw new ApiError(-1, '分片上传会话无效');
    if (cancelled) {
      await abortMultipartUpload(uploadId).catch(() => undefined);
      throw new UploadCancelledError();
    }
    const sessionInfo = latestSession;
    options.onSession?.(sessionInfo);
    if (!session.isCurrent(scope)) throw new ApiError(-2, '租户已切换，上传已取消');
    const totalParts =
      sessionInfo.totalParts || Math.max(1, Math.ceil(file.size / sessionInfo.chunkSize));
    const completed = new Set((sessionInfo.parts ?? []).map((part) => part.part));
    let uploadedBytes = (sessionInfo.parts ?? []).reduce((total, part) => total + part.size, 0);
    options.onProgress?.({ uploadedBytes, totalBytes: file.size, part: 0, totalParts });
    for (let part = 1; part <= totalParts; part++) {
      if (completed.has(part)) continue;
      await waitIfPaused();
      const start = (part - 1) * sessionInfo.chunkSize;
      const blob = file.slice(start, Math.min(file.size, start + sessionInfo.chunkSize));
      let base = uploadedBytes;
      try {
        await putPart({
          uploadId,
          part,
          blob,
          scope,
          setActive: (xhr) => {
            active = xhr;
          },
          onProgress: (loaded) =>
            options.onProgress?.({
              uploadedBytes: base + loaded,
              totalBytes: file.size,
              part,
              totalParts,
            }),
        });
      } catch (error) {
        if (cancelled) throw new UploadCancelledError();
        if (error instanceof UploadPausedError && paused) {
          part--;
          continue;
        }
        throw error;
      }
      uploadedBytes += blob.size;
      options.onProgress?.({ uploadedBytes, totalBytes: file.size, part, totalParts });
    }
    await waitIfPaused();
    const complete = responseData(
      await request<UploadResponse<{ file?: UploadedFile; uploadId: string }>>(
        `/v1/files/multipart/${encodeURIComponent(uploadId)}/complete`,
        {
          method: 'POST',
          body: {},
        },
      ),
    );
    return normalizeFile(complete, file);
  })();

  const pause = () => {
    if (cancelled) return;
    paused = true;
    active?.abort();
  };
  const resume = () => {
    paused = false;
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };
  const cancel = async () => {
    cancelled = true;
    paused = false;
    active?.abort();
    wake?.();
    wake = undefined;
    if (uploadId && !abortSent) {
      abortSent = true;
      await abortMultipartUpload(uploadId).catch(() => undefined);
    }
  };
  return {
    promise,
    get uploadId() {
      return uploadId;
    },
    pause,
    resume,
    cancel,
  };
}
