import log from 'electron-log/main';
import { app } from 'electron';

// Configure log file location and rotation
// In dev: uses ~/.config/yolium-desktop/logs/
// In production: uses platform-specific app data path
const isDev = !app.isPackaged;

// Log levels: error, warn, info, verbose, debug, silly
type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly' | false;

// Allow override via YOLIUM_LOG_LEVEL environment variable
const envLogLevel = process.env.YOLIUM_LOG_LEVEL as LogLevel | undefined;

// Configure file transport
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB max file size
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}';

// Set log level based on environment variable or defaults
if (envLogLevel) {
  // User-specified log level applies to both transports
  log.transports.console.level = envLogLevel;
  log.transports.file.level = envLogLevel;
} else if (isDev) {
  // Dev: DEBUG to both console and file
  log.transports.console.level = 'debug';
  log.transports.file.level = 'debug';
} else {
  // Production: INFO to file, WARN+ to console
  log.transports.console.level = 'warn';
  log.transports.file.level = 'info';
}

// Initialize the logger for main process
log.initialize();

// Export the base logger for direct use
export default log;

// Type for structured log data
type LogData = Record<string, unknown>;

/**
 * Create a scoped logger for a specific component.
 * Adds component prefix to all log messages for easier filtering.
 *
 * @param component - Component name (e.g., 'docker-manager', 'pty-manager')
 * @returns Logger with component-scoped methods
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: LogData) => {
      log.debug(`[${component}] ${message}`, data ? JSON.stringify(data) : '');
    },
    info: (message: string, data?: LogData) => {
      log.info(`[${component}] ${message}`, data ? JSON.stringify(data) : '');
    },
    warn: (message: string, data?: LogData) => {
      log.warn(`[${component}] ${message}`, data ? JSON.stringify(data) : '');
    },
    error: (message: string, data?: LogData) => {
      log.error(`[${component}] ${message}`, data ? JSON.stringify(data) : '');
    },
  };
}

/**
 * Get the current log file path.
 * Useful for displaying to users or debugging.
 */
export function getLogPath(): string {
  return log.transports.file.getFile()?.path || '';
}
