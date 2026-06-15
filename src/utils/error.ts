/**
 * 达梦数据库 CLI 工具 - 错误处理工具
 *
 * 定义 CLI 工具专用的错误类型，提供统一的错误格式化和处理逻辑。
 */

/** 错误代码枚举 */
export enum ErrorCode {
  /** 连接失败 */
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  /** 连接超时 */
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  /** 认证失败 */
  AUTH_FAILED = 'AUTH_FAILED',
  /** 查询执行失败 */
  QUERY_FAILED = 'QUERY_FAILED',
  /** 配置错误 */
  CONFIG_ERROR = 'CONFIG_ERROR',
  /** 配置文件未找到 */
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  /** 连接不存在 */
  CONNECTION_NOT_FOUND = 'CONNECTION_NOT_FOUND',
  /** 连接组不存在 */
  GROUP_NOT_FOUND = 'GROUP_NOT_FOUND',
  /** 参数验证失败 */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** 密码解析失败 */
  PASSWORD_RESOLVE_FAILED = 'PASSWORD_RESOLVE_FAILED',
  /** 导出失败 */
  EXPORT_FAILED = 'EXPORT_FAILED',
  /** 导入失败 */
  IMPORT_FAILED = 'IMPORT_FAILED',
  /** 权限不足 */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** 未知错误 */
  UNKNOWN = 'UNKNOWN',
}

/**
 * CLI 自定义错误类
 *
 * 携带结构化的错误代码和可选的上下文信息，
 * 便于上层统一格式化输出和按错误类型做不同的退出处理。
 */
export class DmcliError extends Error {
  /** 错误代码 */
  readonly code: ErrorCode;
  /** 可选的上下文信息 */
  readonly context?: Record<string, unknown>;
  /** 原始错误（用于保留堆栈） */
  readonly cause?: Error;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    options?: { context?: Record<string, unknown>; cause?: Error }
  ) {
    super(message);
    this.name = 'DmcliError';
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;

    // 保持正确的原型链
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 格式化错误信息用于 CLI 输出
 *
 * @param error - 捕获到的错误
 * @param verbose - 是否输出详细堆栈
 * @returns 格式化后的错误字符串
 */
export function formatError(error: unknown, verbose = false): string {
  if (error instanceof DmcliError) {
    const parts: string[] = [`[${error.code}] ${error.message}`];

    if (verbose && error.context) {
      parts.push(`  Context: ${JSON.stringify(error.context, null, 2)}`);
    }
    if (verbose && error.cause) {
      parts.push(`  Cause: ${error.cause.message}`);
      if (error.cause.stack) {
        parts.push(error.cause.stack);
      }
    } else if (verbose && error.stack) {
      parts.push(error.stack);
    }

    return parts.join('\n');
  }

  if (error instanceof Error) {
    const parts: string[] = [error.message];
    if (verbose && error.stack) {
      parts.push(error.stack);
    }
    return parts.join('\n');
  }

  return String(error);
}

/**
 * 判断错误是否为可重试的瞬态错误
 *
 * 用于连接失败时自动重试的判断依据。
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof DmcliError) {
    return (
      error.code === ErrorCode.CONNECTION_TIMEOUT ||
      error.code === ErrorCode.CONNECTION_FAILED
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    );
  }

  return false;
}

/**
 * 将未知错误包装为 DmcliError
 */
export function wrapError(error: unknown, code: ErrorCode, message?: string): DmcliError {
  if (error instanceof DmcliError) {
    return error;
  }

  const cause = error instanceof Error ? error : undefined;
  const resolvedMessage = message ?? (cause?.message ?? String(error));

  return new DmcliError(resolvedMessage, code, { cause });
}
