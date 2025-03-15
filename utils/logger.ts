// Logger utility to standardize logging across the application
// Supports different log levels and structured logging

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

// Default to INFO in production, DEBUG in development
const DEFAULT_LOG_LEVEL = Deno.env.get("ENV") === "production" ? LogLevel.INFO : LogLevel.DEBUG;

// Get configured log level or use default
const configuredLevel = Deno.env.get("LOG_LEVEL");
const CURRENT_LOG_LEVEL = configuredLevel
  ? (Object.values(LogLevel).includes(configuredLevel as LogLevel)
    ? configuredLevel as LogLevel
    : DEFAULT_LOG_LEVEL)
  : DEFAULT_LOG_LEVEL;

// Log level priority map
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

// Check if a log level should be displayed based on current configuration
const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
};

// Format message with timestamp and log level
const formatLog = (level: LogLevel, message: string, data?: unknown): string => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;

  if (data !== undefined) {
    let dataStr: string;
    try {
      dataStr = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    } catch (_err) {
      dataStr = "[Error serializing log data]";
    }
    return `${prefix} ${message} ${dataStr}`;
  }

  return `${prefix} ${message}`;
};

// Core logging function
const log = (level: LogLevel, message: string, data?: unknown): void => {
  if (!shouldLog(level)) return;

  const formattedMessage = formatLog(level, message, data);

  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage);
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage);
      break;
    case LogLevel.DEBUG:
    case LogLevel.INFO:
    default:
      console.log(formattedMessage);
      break;
  }
};

// Public API
export const logger = {
  debug: (message: string, data?: unknown) => log(LogLevel.DEBUG, message, data),
  info: (message: string, data?: unknown) => log(LogLevel.INFO, message, data),
  warn: (message: string, data?: unknown) => log(LogLevel.WARN, message, data),
  error: (message: string, data?: unknown) => log(LogLevel.ERROR, message, data),
};

export default logger;
