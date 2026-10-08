export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export async function fetchJson(
  url: string | URL,
  options: FetchOptions = {},
  headers: Record<string, string> = {},
): Promise<unknown> {
  const attempts = (options.retries ?? 1) + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 12_000);
    try {
      const response = await (options.fetchImpl ?? fetch)(url, {
        headers: { Accept: "application/json", ...headers },
        signal: options.signal
          ? AbortSignal.any([timeout, options.signal])
          : timeout,
        cache: "no-store",
      });
      if (!response.ok) {
        if (
          attempt + 1 < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(
                Number.isFinite(retryAfter) && retryAfter > 0
                  ? retryAfter * 1000
                  : 400 * 2 ** attempt,
                2000,
              ),
            ),
          );
          continue;
        }
        // Do not include the URL: it may contain a server-only API key.
        throw new Error(`Metadata service returned HTTP ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (
        options.signal?.aborted ||
        attempt + 1 >= attempts ||
        (error instanceof Error && error.message.startsWith("Metadata service"))
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw new Error("Metadata service did not respond");
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          results[index] = {
            status: "fulfilled",
            value: await worker(items[index]),
          };
        } catch (reason: unknown) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}
