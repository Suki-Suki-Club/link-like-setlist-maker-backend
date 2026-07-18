// lovelive-anime.jp は非ブラウザ UA に 403 を返す(検証済み)ため、ブラウザ相当の UA を使う。
// 負荷は直列 + 2 秒間隔で最小限に抑えている。
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type FetcherOptions = {
  /** リクエスト間の待機時間。公式サイトへの負荷を抑えるため直列かつ既定 2 秒空ける */
  intervalMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  maxRetries?: number;
};

export type Fetcher = {
  fetchPage(url: string): Promise<string>;
  requestCount(): number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const intervalMs = options.intervalMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxRetries = options.maxRetries ?? 2;

  let lastRequestAt = 0;
  let requests = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function fetchOnce(url: string): Promise<string> {
    const waitMs = lastRequestAt + intervalMs - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestAt = Date.now();
    requests += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: controller.signal
      });

      if (response.status === 403) {
        throw new GeoBlockedError(url);
      }

      if (!response.ok) {
        throw new FetchFailedError(url, response.status);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchWithRetry(url: string): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await fetchOnce(url);
      } catch (error) {
        // 地域ブロックはリトライしても解消しないので即座に伝播させる
        if (error instanceof GeoBlockedError) {
          throw error;
        }

        lastError = error;
        await sleep(intervalMs * (attempt + 1));
      }
    }

    throw lastError;
  }

  return {
    fetchPage(url: string) {
      const next = queue.then(() => fetchWithRetry(url));
      queue = next.catch(() => undefined);
      return next;
    },
    requestCount() {
      return requests;
    }
  };
}

export class GeoBlockedError extends Error {
  constructor(url: string) {
    super(
      `Received 403 for ${url} — the runner is outside Japan or the user-agent is being blocked`
    );
    this.name = "GeoBlockedError";
  }
}

export class FetchFailedError extends Error {
  readonly status: number;

  constructor(url: string, status: number) {
    super(`Request for ${url} failed with status ${status}`);
    this.name = "FetchFailedError";
    this.status = status;
  }
}
