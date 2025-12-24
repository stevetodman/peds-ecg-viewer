/**
 * Structured Logging Utility
 *
 * Provides consistent, configurable logging across the application.
 *
 * Features:
 * - Log levels: DEBUG, INFO, WARN, ERROR
 * - Structured log format with timestamps and context
 * - Environment-configurable log level
 * - Silent mode for testing
 * - Module-specific loggers
 *
 * @module utils/logger
 */

/**
 * Available log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Log level string representations
 */
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Log entry structure
 */
export interface LogEntry {
  /** Timestamp in ISO format */
  timestamp: string;

  /** Log level */
  level: LogLevelName;

  /** Module/component name */
  module: string;

  /** Log message */
  message: string;

  /** Additional context data */
  context?: Record<string, unknown>;

  /** Error object if applicable */
  error?: Error;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;

  /** Enable JSON output format */
  jsonOutput?: boolean;

  /** Include timestamps in output */
  includeTimestamp?: boolean;

  /** Custom output handler (default: console) */
  outputHandler?: (entry: LogEntry) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  jsonOutput: false,
  includeTimestamp: true,
};

/**
 * Global logger configuration
 */
let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Parse log level from string
 */
function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return LogLevel.INFO;

  switch (level.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'silent':
    case 'none':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Get log level name from enum
 */
function getLevelName(level: LogLevel): LogLevelName {
  switch (level) {
    case LogLevel.DEBUG:
      return 'debug';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.WARN:
      return 'warn';
    case LogLevel.ERROR:
      return 'error';
    case LogLevel.SILENT:
      return 'silent';
    default:
      return 'info';
  }
}

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Set log level from environment variable
 * Reads from LOG_LEVEL or GEMUSE_LOG_LEVEL
 */
export function configureFromEnvironment(): void {
  const envLevel =
    (typeof process !== 'undefined' && process.env?.LOG_LEVEL) ||
    (typeof process !== 'undefined' && process.env?.GEMUSE_LOG_LEVEL);

  if (envLevel) {
    globalConfig.minLevel = parseLogLevel(envLevel);
  }
}

/**
 * Set minimum log level
 */
export function setLogLevel(level: LogLevel | LogLevelName): void {
  if (typeof level === 'string') {
    globalConfig.minLevel = parseLogLevel(level);
  } else {
    globalConfig.minLevel = level;
  }
}

/**
 * Get current log level
 */
export function getLogLevel(): LogLevel {
  return globalConfig.minLevel;
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts: string[] = [];

  if (globalConfig.includeTimestamp) {
    parts.push(`[${entry.timestamp}]`);
  }

  parts.push(`[${entry.level.toUpperCase()}]`);
  parts.push(`[${entry.module}]`);
  parts.push(entry.message);

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }

  return parts.join(' ');
}

/**
 * Default output handler using console
 */
function defaultOutputHandler(entry: LogEntry): void {
  const output = globalConfig.jsonOutput
    ? JSON.stringify(entry)
    : formatLogEntry(entry);

  switch (entry.level) {
    case 'error':
      console.error(output);
      if (entry.error) {
        console.error(entry.error);
      }
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Module-specific logger instance
 */
export class Logger {
  private module: string;
  private config: LoggerConfig;

  constructor(module: string, config?: Partial<LoggerConfig>) {
    this.module = module;
    this.config = { ...globalConfig, ...config };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.minLevel;
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: getLevelName(level),
      module: this.module,
      message,
      context,
      error,
    };
  }

  /**
   * Output a log entry
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, message, context, error);
    const handler = this.config.outputHandler || defaultOutputHandler;
    handler(entry);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Create a child logger with additional context
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, this.config);
  }

  /**
   * Create a child logger with fixed context
   */
  withContext(fixedContext: Record<string, unknown>): LoggerWithContext {
    return new LoggerWithContext(this, fixedContext);
  }
}

/**
 * Logger with fixed context that's included in every log
 */
class LoggerWithContext {
  private logger: Logger;
  private fixedContext: Record<string, unknown>;

  constructor(logger: Logger, fixedContext: Record<string, unknown>) {
    this.logger = logger;
    this.fixedContext = fixedContext;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(message, { ...this.fixedContext, ...context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.fixedContext, ...context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(message, { ...this.fixedContext, ...context });
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.logger.error(message, error, { ...this.fixedContext, ...context });
  }
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * Create a silent logger (for testing)
 */
export function createSilentLogger(module: string): Logger {
  return new Logger(module, { minLevel: LogLevel.SILENT });
}

/**
 * Default logger instance for quick use
 */
export const defaultLogger = createLogger('gemuse');

// Initialize from environment on module load
if (typeof process !== 'undefined') {
  configureFromEnvironment();
}
