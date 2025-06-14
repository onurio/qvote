import logger from "@utils/logger.ts";

// Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT = 30000;

// Timeout for Slack API requests (10 seconds)
const SLACK_API_TIMEOUT = 10000;

export interface RequestOptions extends RequestInit {
  timeout?: number;
}

/**
 * Makes an HTTP request with timeout support
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestOptions = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      logger.error(`Request timeout after ${timeout}ms: ${url}`);
      throw new Error(`Request timeout after ${timeout}ms`);
    }

    throw error;
  }
}

/**
 * Makes a Slack API request with appropriate timeout and error handling
 */
export async function slackApiRequest(
  url: string | URL,
  options: RequestOptions = {},
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, {
      ...options,
      timeout: options.timeout || SLACK_API_TIMEOUT,
    });
  } catch (error) {
    logger.error(`Slack API request failed: ${url}`, error);
    throw error;
  }
}

/**
 * Posts to Slack API with JSON body
 */
export async function postToSlackApi(
  url: string | URL,
  body: unknown,
  headers: HeadersInit = {},
): Promise<Response> {
  return await slackApiRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
