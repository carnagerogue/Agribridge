import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Structured operational logging. Each entry is one JSON line, so any log
 * collector can index it. Entries describe requests and failures only: never
 * bodies, query strings (which can carry farm coordinates), cookies, phone
 * numbers, AI text or error messages (database errors can echo stored values).
 */
export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;
export type Logger = Record<
  LogLevel,
  (event: string, fields?: LogFields) => void
>;

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function createLogger(
  write: (line: string, level: LogLevel) => void = (line, level) =>
    (level === "error" ? process.stderr : process.stdout).write(`${line}\n`),
  now: () => Date = () => new Date(),
): Logger {
  const entry =
    (level: LogLevel) =>
    (event: string, fields: LogFields = {}) =>
      write(
        JSON.stringify({ time: now().toISOString(), level, event, ...fields }),
        level,
      );
  return { info: entry("info"), warn: entry("warn"), error: entry("error") };
}

const INBOUND_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const IDENTIFIER =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

/** The request path with identifiers masked and the query string removed. */
export function logPath(originalUrl: string) {
  return originalUrl
    .split("?")[0]
    .split("/")
    .map((segment) => (IDENTIFIER.test(segment) ? ":id" : segment))
    .join("/")
    .slice(0, 200);
}

export function requestId(res: Response): string | undefined {
  return res.locals.requestId;
}

/**
 * Assigns every request an ID (returned as `X-Request-Id`) and logs each API
 * request, plus any server error, when the response finishes. An inbound ID
 * is reused only from a trusted reverse proxy.
 */
export function requestLogging(logger: Logger, trustInboundId: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const inbound = req.get("x-request-id");
    const id =
      trustInboundId && inbound && INBOUND_REQUEST_ID.test(inbound)
        ? inbound
        : randomUUID();
    res.locals.requestId = id;
    res.set("X-Request-Id", id);
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const api = req.originalUrl.startsWith("/api");
      if (!api && res.statusCode < 500) return;
      const level: LogLevel =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info";
      logger[level]("http.request", {
        requestId: id,
        method: req.method,
        path: logPath(req.originalUrl),
        status: res.statusCode,
        durationMs:
          Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100,
      });
    });
    next();
  };
}

/** Error class, code and stack frames; never the message, which may hold data. */
export function errorFields(error: unknown): LogFields {
  const value = error as { name?: unknown; code?: unknown; stack?: unknown };
  return {
    errorName: typeof value?.name === "string" ? value.name : "unknown",
    errorCode:
      typeof value?.code === "string" || typeof value?.code === "number"
        ? String(value.code)
        : undefined,
    stack:
      typeof value?.stack === "string"
        ? value.stack
            .split("\n")
            .filter((line) => /^\s+at /.test(line))
            .slice(0, 12)
            .map((line) => line.trim())
            .join(" | ")
        : undefined,
  };
}
