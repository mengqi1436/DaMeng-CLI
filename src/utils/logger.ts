/**
 * 达梦数据库 CLI 工具 - 日志工具
 *
 * 提供统一的日志输出，支持不同级别和颜色。
 * 在 CLI 环境中使用 chalk 着色，非 TTY 环境降级为纯文本。
 */

import chalk from 'chalk';

/** 日志级别 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/** 日志级别名称映射 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
};

/** 从环境变量解析日志级别 */
function resolveLogLevel(): LogLevel {
  const envLevel = process.env.DMCLI_LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LogLevel) {
    return LogLevel[envLevel as keyof typeof LogLevel];
  }
  if (process.env.DMCLI_DEBUG === 'true') {
    return LogLevel.DEBUG;
  }
  return LogLevel.INFO;
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor() {
    this.level = resolveLogLevel();
    this.prefix = '[dmcli]';
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * DEBUG 级别日志（仅在 --verbose 或 DMCLI_DEBUG=true 时输出）
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(chalk.gray(`${this.prefix} [DEBUG] ${message}`), ...args);
    }
  }

  /**
   * INFO 级别日志
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(chalk.cyan(`${this.prefix} ${message}`), ...args);
    }
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow(`${this.prefix} [WARN] ${message}`), ...args);
    }
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(chalk.red(`${this.prefix} [ERROR] ${message}`), ...args);
    }
  }

  /**
   * 成功消息（绿色）
   */
  success(message: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.green(`${this.prefix} ${message}`));
    }
  }

  /**
   * 静默日志（仅在 SILENT 级别下不输出）
   */
  log(message: string, ...args: unknown[]): void {
    if (this.level < LogLevel.SILENT) {
      console.log(message, ...args);
    }
  }
}

/** 全局日志实例 */
export const logger = new Logger();
