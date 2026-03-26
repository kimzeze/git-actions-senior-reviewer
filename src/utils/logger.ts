type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env["LOG_LEVEL"] as LogLevel) ?? "info";

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) =>
    log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) =>
    log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) =>
    log("error", msg, data),
};
