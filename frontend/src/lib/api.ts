const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8740/v1";

export function getApiBaseUrl() {
  if (typeof window === "undefined") return configuredApiUrl;

  try {
    const configured = new URL(configuredApiUrl);
    const isLocal =
      configured.hostname === "localhost" || configured.hostname === "127.0.0.1";

    if (isLocal) {
      configured.hostname = window.location.hostname;
      return configured.toString().replace(/\/$/, "");
    }
  } catch {
    return configuredApiUrl;
  }

  return configuredApiUrl.replace(/\/$/, "");
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
  source: string;
}

/**
 * Upload files via multipart/form-data.
 * Does NOT set Content-Type so the browser auto-generates the multipart boundary.
 */
export async function apiUpload(
  path: string,
  formData: FormData,
): Promise<{ files: UploadedFile[] }> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    body: formData,
    // NOTE: Do NOT set Content-Type — browser sets it with boundary
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Upload failed with ${response.status}`);
  }

  return response.json();
}
