/**
 * Tests for structured logging utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Logger,
  LogLevel,
  LogEntry,
  createLogger,
  createSilentLogger,
  configureLogger,
  setLogLevel,
  getLogLevel,
} from '../../../src/utils/logger';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Reset to default log level
    setLogLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with module name', () => {
      const logger = createLogger('test-module');
      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('[test-module]');
      expect(output).toContain('Test message');
    });

    it('should include timestamp by default', () => {
      const logger = createLogger('test');
      logger.info('Test');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      // Check for ISO timestamp pattern
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Log Levels', () => {
    it('should log debug messages', () => {
      const logger = createLogger('test');
      logger.debug('Debug message');

      expect(consoleDebugSpy).toHaveBeenCalled();
      const output = consoleDebugSpy.mock.calls[0][0] as string;
      expect(output).toContain('[DEBUG]');
    });

    it('should log info messages', () => {
      const logger = createLogger('test');
      logger.info('Info message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('[INFO]');
    });

    it('should log warn messages', () => {
      const logger = createLogger('test');
      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
    });

    it('should log error messages', () => {
      const logger = createLogger('test');
      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
    });

    it('should log error with Error object', () => {
      const logger = createLogger('test');
      const error = new Error('Test error');
      logger.error('Something failed', error);

      // Should call console.error twice: once for message, once for error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter debug messages when level is INFO', () => {
      setLogLevel(LogLevel.INFO);
      const logger = createLogger('test');

      logger.debug('Should not appear');
      logger.info('Should appear');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter debug and info when level is WARN', () => {
      setLogLevel(LogLevel.WARN);
      const logger = createLogger('test');

      logger.debug('Should not appear');
      logger.info('Should not appear');
      logger.warn('Should appear');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should only log errors when level is ERROR', () => {
      setLogLevel(LogLevel.ERROR);
      const logger = createLogger('test');

      logger.debug('No');
      logger.info('No');
      logger.warn('No');
      logger.error('Yes');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log nothing when level is SILENT', () => {
      setLogLevel(LogLevel.SILENT);
      const logger = createLogger('test');

      logger.debug('No');
      logger.info('No');
      logger.warn('No');
      logger.error('No');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Context', () => {
    it('should include context in log output', () => {
      const logger = createLogger('test');
      logger.info('Message with context', { userId: 123, action: 'login' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('userId');
      expect(output).toContain('123');
      expect(output).toContain('action');
      expect(output).toContain('login');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with combined module name', () => {
      const parent = createLogger('parent');
      const child = parent.child('child');

      child.info('From child');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('[parent:child]');
    });
  });

  describe('Logger with Fixed Context', () => {
    it('should include fixed context in all logs', () => {
      const logger = createLogger('test');
      const contextLogger = logger.withContext({ requestId: 'abc-123' });

      contextLogger.info('First message');
      contextLogger.warn('Second message');

      const output1 = consoleLogSpy.mock.calls[0][0] as string;
      const output2 = consoleWarnSpy.mock.calls[0][0] as string;

      expect(output1).toContain('requestId');
      expect(output1).toContain('abc-123');
      expect(output2).toContain('requestId');
      expect(output2).toContain('abc-123');
    });

    it('should merge fixed context with log-specific context', () => {
      const logger = createLogger('test');
      const contextLogger = logger.withContext({ requestId: 'abc-123' });

      contextLogger.info('Message', { extra: 'data' });

      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('requestId');
      expect(output).toContain('extra');
      expect(output).toContain('data');
    });
  });

  describe('createSilentLogger', () => {
    it('should create a logger that outputs nothing', () => {
      const logger = createSilentLogger('test');

      logger.debug('No');
      logger.info('No');
      logger.warn('No');
      logger.error('No');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('configureLogger', () => {
    it('should allow JSON output format', () => {
      configureLogger({ jsonOutput: true });
      const logger = createLogger('test');

      logger.info('Test message');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      // Should be valid JSON
      const parsed = JSON.parse(output) as LogEntry;
      expect(parsed.message).toBe('Test message');
      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('test');

      // Reset
      configureLogger({ jsonOutput: false });
    });

    it('should allow disabling timestamps', () => {
      configureLogger({ includeTimestamp: false, minLevel: LogLevel.DEBUG });
      const logger = createLogger('test');

      logger.info('Test');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      // Should not have timestamp pattern
      expect(output).not.toMatch(/\[\d{4}-\d{2}-\d{2}T/);

      // Reset
      configureLogger({ includeTimestamp: true });
    });

    it('should support custom output handler', () => {
      const customHandler = vi.fn();
      configureLogger({ outputHandler: customHandler, minLevel: LogLevel.DEBUG });
      const logger = createLogger('test');

      logger.info('Custom output');

      expect(customHandler).toHaveBeenCalled();
      const entry = customHandler.mock.calls[0][0] as LogEntry;
      expect(entry.message).toBe('Custom output');
      expect(entry.module).toBe('test');
      expect(entry.level).toBe('info');

      // Console should NOT be called
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Reset
      configureLogger({ outputHandler: undefined });
    });
  });

  describe('setLogLevel with string', () => {
    it('should accept level name as string', () => {
      setLogLevel('warn');
      expect(getLogLevel()).toBe(LogLevel.WARN);

      setLogLevel('debug');
      expect(getLogLevel()).toBe(LogLevel.DEBUG);

      setLogLevel('error');
      expect(getLogLevel()).toBe(LogLevel.ERROR);
    });

    it('should handle case-insensitive level names', () => {
      setLogLevel('WARN');
      expect(getLogLevel()).toBe(LogLevel.WARN);

      setLogLevel('Debug');
      expect(getLogLevel()).toBe(LogLevel.DEBUG);
    });

    it('should handle "warning" as alias for warn', () => {
      setLogLevel('warning');
      expect(getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should handle "none" as alias for silent', () => {
      setLogLevel('none');
      expect(getLogLevel()).toBe(LogLevel.SILENT);
    });
  });
});
