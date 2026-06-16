/**
 * 数据迁移器 - 负责表数据的批量迁移
 *
 * 功能:
 * - 批量读取源表数据
 * - 批量写入目标表
 * - 进度回调
 * - 断点续传（记录已迁移行数）
 * - 并行迁移多个表
 * - 事务支持
 */

import { EventEmitter } from 'events';

// ==================== 类型定义 ====================

/**
 * 数据库连接器接口
 *
 * 抽象数据库操作，支持不同数据库实现
 */
export interface DatabaseConnector {
  /** 获取表行数 */
  getRowCount(tableName: string, schema?: string): Promise<number>;

  /** 创建读取流（异步迭代器） */
  createReadStream(
    tableName: string,
    options?: ReadStreamOptions
  ): AsyncIterableIterator<Record<string, unknown>[]>;

  /** 批量插入数据 */
  bulkInsert(
    tableName: string,
    rows: Record<string, unknown>[],
    options?: BulkInsertOptions
  ): Promise<number>;

  /** 清空表数据 */
  truncateTable(tableName: string, schema?: string): Promise<void>;

  /** 开始事务 */
  beginTransaction(): Promise<void>;

  /** 提交事务 */
  commit(): Promise<void>;

  /** 回滚事务 */
  rollback(): Promise<void>;

  /** 关闭连接 */
  close(): Promise<void>;
}

/**
 * 读取流选项
 */
export interface ReadStreamOptions {
  /** 批次大小 */
  batchSize?: number;
  /** WHERE 过滤条件 */
  where?: string;
  /** 要读取的列 */
  columns?: string[];
  /** 偏移量（用于断点续传） */
  offset?: number;
  /** 排序字段 */
  orderBy?: string;
}

/**
 * 批量插入选项
 */
export interface BulkInsertOptions {
  /** 是否先清空表 */
  truncate?: boolean;
  /** 是否使用事务 */
  useTransaction?: boolean;
  /** 冲突处理策略 */
  conflictStrategy?: 'skip' | 'update' | 'error';
}

/**
 * 数据迁移选项
 */
export interface DataMigrationOptions {
  /** 源数据库连接器 */
  source: DatabaseConnector;
  /** 目标数据库连接器 */
  target: DatabaseConnector;
  /** 要迁移的表名列表 */
  tables: string[];
  /** Schema 列表（可选） */
  schemas?: string[];
  /** 批次大小，默认 1000 */
  batchSize?: number;
  /** 并行迁移表数量，默认 1 */
  parallel?: number;
  /** 遇到错误是否继续 */
  continueOnError?: boolean;
  /** 是否清空目标表 */
  truncateTarget?: boolean;
  /** 数据过滤条件 */
  where?: string;
  /** 要迁移的列 */
  columns?: string[];
  /** 是否显示进度 */
  progress?: boolean;
  /** 进度回调函数 */
  onProgress?: ProgressCallback;
  /** 断点续传状态文件路径 */
  checkpointFile?: string;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 表名 */
  tableName: string;
  /** 总行数 */
  totalRows: number;
  /** 已迁移行数 */
  migratedRows: number;
  /** 错误列表 */
  errors: Error[];
  /** 迁移耗时（毫秒） */
  duration: number;
  /** 是否完成 */
  completed: boolean;
}

/**
 * 迁移进度信息
 */
export interface MigrationProgress {
  /** 表名 */
  tableName: string;
  /** 总行数 */
  totalRows: number;
  /** 已迁移行数 */
  migratedRows: number;
  /** 进度百分比 (0-100) */
  percent: number;
  /** 当前批次 */
  currentBatch: number;
  /** 总批次 */
  totalBatches: number;
  /** 已耗时（毫秒） */
  elapsed: number;
  /** 预计剩余时间（毫秒） */
  estimatedRemaining: number;
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: MigrationProgress) => void;

/**
 * 断点续传检查点
 */
interface MigrationCheckpoint {
  /** 表名 */
  tableName: string;
  /** 已迁移行数 */
  migratedRows: number;
  /** 最后更新时间 */
  lastUpdated: string;
}

// ==================== 迁移错误 ====================

/**
 * 迁移错误类
 */
export class MigrationError extends Error {
  /** 错误代码 */
  code: string;
  /** 错误详情 */
  details?: unknown;
  /** 原始错误 */
  cause?: Error;

  constructor(
    message: string,
    options?: { code?: string; details?: unknown; cause?: Error }
  ) {
    super(message);
    this.name = 'MigrationError';
    this.code = options?.code || 'MIGRATION_ERROR';
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * 迁移错误代码
 */
export const MIGRATION_ERROR_CODES = {
  CONNECTION_FAILED: 'MIGRATION_CONNECTION_FAILED',
  TABLE_NOT_FOUND: 'MIGRATION_TABLE_NOT_FOUND',
  DATA_READ_FAILED: 'MIGRATION_DATA_READ_FAILED',
  DATA_WRITE_FAILED: 'MIGRATION_DATA_WRITE_FAILED',
  CHECKPOINT_FAILED: 'MIGRATION_CHECKPOINT_FAILED',
  MIGRATION_CANCELLED: 'MIGRATION_CANCELLED',
} as const;

// ==================== 数据迁移器 ====================

/**
 * 数据迁移器
 *
 * 负责将数据从源数据库迁移到目标数据库。
 * 支持批量处理、并行迁移、进度回调和断点续传。
 *
 * @example
 * ```typescript
 * const migrator = new DataMigrator({
 *   source: sourceConnector,
 *   target: targetConnector,
 *   tables: ['users', 'orders'],
 *   batchSize: 5000,
 *   parallel: 2,
 *   onProgress: (progress) => {
 *     console.log(`${progress.tableName}: ${progress.percent}%`);
 *   }
 * });
 *
 * const results = await migrator.migrateData();
 * ```
 */
export class DataMigrator extends EventEmitter {
  /** 迁移选项 */
  private options: Required<
    Omit<
      DataMigrationOptions,
      'schemas' | 'where' | 'columns' | 'onProgress' | 'checkpointFile'
    >
  > &
    Pick<
      DataMigrationOptions,
      'schemas' | 'where' | 'columns' | 'onProgress' | 'checkpointFile'
    >;

  /** 断点续传检查点 */
  private checkpoints: Map<string, MigrationCheckpoint> = new Map();

  /** 是否已取消 */
  private cancelled = false;

  constructor(options: DataMigrationOptions) {
    super();

    // 设置默认值
    this.options = {
      source: options.source,
      target: options.target,
      tables: options.tables,
      schemas: options.schemas,
      batchSize: options.batchSize || 1000,
      parallel: options.parallel || 1,
      continueOnError: options.continueOnError || false,
      truncateTarget: options.truncateTarget || false,
      where: options.where,
      columns: options.columns,
      progress: options.progress !== false,
      onProgress: options.onProgress,
      checkpointFile: options.checkpointFile,
    };
  }

  // ==================== 公共方法 ====================

  /**
   * 迁移所有配置的表
   *
   * @returns 迁移结果列表
   */
  async migrateData(): Promise<MigrationResult[]> {
    this.cancelled = false;
    const results: MigrationResult[] = [];

    // 加载检查点（断点续传）
    if (this.options.checkpointFile) {
      await this.loadCheckpoints();
    }

    // 并行迁移控制
    const parallel = Math.min(this.options.parallel, this.options.tables.length);

    if (parallel <= 1) {
      // 串行迁移
      for (const tableName of this.options.tables) {
        if (this.cancelled) {
          break;
        }

        const result = await this.migrateTable(tableName);
        results.push(result);

        // 如果不允许继续出错且有错误，停止迁移
        if (!this.options.continueOnError && result.errors.length > 0) {
          break;
        }
      }
    } else {
      // 并行迁移
      const chunks = this.chunkArray(this.options.tables, parallel);

      for (const chunk of chunks) {
        if (this.cancelled) {
          break;
        }

        const chunkResults = await Promise.all(
          chunk.map((tableName) => this.migrateTable(tableName))
        );

        results.push(...chunkResults);

        // 检查是否有错误需要停止
        if (!this.options.continueOnError) {
          const hasErrors = chunkResults.some((r) => r.errors.length > 0);
          if (hasErrors) {
            break;
          }
        }
      }
    }

    // 保存检查点
    if (this.options.checkpointFile) {
      await this.saveCheckpoints();
    }

    return results;
  }

  /**
   * 迁移单个表
   *
   * @param tableName - 表名
   * @returns 迁移结果
   */
  async migrateTable(tableName: string): Promise<MigrationResult> {
    const startTime = Date.now();
    let totalRows = 0;
    let migratedRows = 0;
    const errors: Error[] = [];
    let completed = false;

    try {
      // 发出开始事件
      this.emit('tableStart', tableName);

      // 1. 获取源表行数
      totalRows = await this.getRowCount(tableName);

      // 2. 检查断点续传
      const checkpoint = this.checkpoints.get(tableName);
      if (checkpoint && checkpoint.migratedRows > 0) {
        migratedRows = checkpoint.migratedRows;
        this.emit('resume', tableName, migratedRows);
      }

      // 3. 如果需要清空目标表且从头开始
      if (this.options.truncateTarget && migratedRows === 0) {
        await this.options.target.truncateTable(tableName);
      }

      // 4. 开始事务
      await this.options.target.beginTransaction();

      try {
        // 5. 创建读取流
        const readStream = this.options.source.createReadStream(tableName, {
          batchSize: this.options.batchSize,
          where: this.options.where,
          columns: this.options.columns,
          offset: migratedRows,
        });

        // 6. 批量写入目标
        let batchNumber = Math.floor(migratedRows / this.options.batchSize);
        const totalBatches = Math.ceil(totalRows / this.options.batchSize);

        for await (const batch of readStream) {
          if (this.cancelled) {
            throw new MigrationError('迁移已取消', {
              code: MIGRATION_ERROR_CODES.MIGRATION_CANCELLED,
            });
          }

          try {
            // 批量插入
            const inserted = await this.options.target.bulkInsert(
              tableName,
              batch,
              {
                truncate: false,
                useTransaction: true,
              }
            );

            migratedRows += inserted;
            batchNumber++;

            // 更新进度
            this.updateProgress(
              tableName,
              totalRows,
              migratedRows,
              batchNumber,
              totalBatches,
              startTime
            );

            // 更新检查点
            this.updateCheckpoint(tableName, migratedRows);
          } catch (error) {
            const migrationError =
              error instanceof MigrationError
                ? error
                : new MigrationError(
                    `表 ${tableName} 批量插入失败: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                    {
                      code: MIGRATION_ERROR_CODES.DATA_WRITE_FAILED,
                      cause:
                        error instanceof Error ? error : new Error(String(error)),
                    }
                  );

            if (this.options.continueOnError) {
              errors.push(migrationError);
              this.emit('batchError', tableName, migrationError);
            } else {
              throw migrationError;
            }
          }
        }

        // 7. 提交事务
        await this.options.target.commit();
        completed = true;
      } catch (error) {
        // 回滚事务
        await this.options.target.rollback();
        throw error;
      }

      // 发出完成事件
      this.emit('tableComplete', tableName, migratedRows);
    } catch (error) {
      const migrationError =
        error instanceof MigrationError
          ? error
          : new MigrationError(
              `表 ${tableName} 迁移失败: ${
                error instanceof Error ? error.message : String(error)
              }`,
              {
                code: MIGRATION_ERROR_CODES.DATA_WRITE_FAILED,
                cause:
                  error instanceof Error ? error : new Error(String(error)),
              }
            );

      errors.push(migrationError);
      this.emit('tableError', tableName, migrationError);
    }

    const duration = Date.now() - startTime;

    return {
      tableName,
      totalRows,
      migratedRows,
      errors,
      duration,
      completed,
    };
  }

  /**
   * 获取表行数
   *
   * @param tableName - 表名
   * @returns 行数
   */
  async getRowCount(tableName: string): Promise<number> {
    try {
      return await this.options.source.getRowCount(
        tableName,
        this.options.schemas?.[0]
      );
    } catch (error) {
      throw new MigrationError(
        `获取表 ${tableName} 行数失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          code: MIGRATION_ERROR_CODES.TABLE_NOT_FOUND,
          cause: error instanceof Error ? error : new Error(String(error)),
        }
      );
    }
  }

  /**
   * 创建读取流
   *
   * @param tableName - 表名
   * @param options - 读取选项
   * @returns 异步迭代器
   */
  createReadStream(
    tableName: string,
    options?: ReadStreamOptions
  ): AsyncIterableIterator<Record<string, unknown>[]> {
    return this.options.source.createReadStream(tableName, {
      batchSize: options?.batchSize || this.options.batchSize,
      where: options?.where || this.options.where,
      columns: options?.columns || this.options.columns,
      offset: options?.offset,
      orderBy: options?.orderBy,
    });
  }

  /**
   * 批量插入数据
   *
   * @param tableName - 表名
   * @param rows - 数据行
   * @param options - 插入选项
   * @returns 插入行数
   */
  async bulkInsert(
    tableName: string,
    rows: Record<string, unknown>[],
    options?: BulkInsertOptions
  ): Promise<number> {
    return this.options.target.bulkInsert(tableName, rows, options);
  }

  /**
   * 取消迁移
   */
  cancel(): void {
    this.cancelled = true;
    this.emit('cancelled');
  }

  // ==================== 进度和检查点 ====================

  /**
   * 更新进度
   */
  private updateProgress(
    tableName: string,
    totalRows: number,
    migratedRows: number,
    currentBatch: number,
    totalBatches: number,
    startTime: number
  ): void {
    const elapsed = Date.now() - startTime;
    const percent =
      totalRows > 0 ? Math.round((migratedRows / totalRows) * 100) : 0;

    // 计算预计剩余时间
    const estimatedRemaining =
      migratedRows > 0
        ? Math.round((elapsed / migratedRows) * (totalRows - migratedRows))
        : 0;

    const progress: MigrationProgress = {
      tableName,
      totalRows,
      migratedRows,
      percent,
      currentBatch,
      totalBatches,
      elapsed,
      estimatedRemaining,
    };

    // 调用回调
    if (this.options.onProgress) {
      this.options.onProgress(progress);
    }

    // 发出进度事件
    this.emit('progress', progress);
  }

  /**
   * 更新检查点
   */
  private updateCheckpoint(tableName: string, migratedRows: number): void {
    this.checkpoints.set(tableName, {
      tableName,
      migratedRows,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * 加载检查点
   */
  private async loadCheckpoints(): Promise<void> {
    if (!this.options.checkpointFile) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.options.checkpointFile, 'utf-8');
      const checkpoints: MigrationCheckpoint[] = JSON.parse(content);

      for (const checkpoint of checkpoints) {
        this.checkpoints.set(checkpoint.tableName, checkpoint);
      }
    } catch {
      // 文件不存在或解析失败，忽略
    }
  }

  /**
   * 保存检查点
   */
  private async saveCheckpoints(): Promise<void> {
    if (!this.options.checkpointFile) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const checkpoints = Array.from(this.checkpoints.values());
      await fs.writeFile(
        this.options.checkpointFile,
        JSON.stringify(checkpoints, null, 2),
        'utf-8'
      );
    } catch (error) {
      this.emit(
        'warning',
        `保存检查点失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 将数组分割为多个块
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建数据迁移器
 *
 * @param options - 迁移选项
 * @returns DataMigrator 实例
 */
export function createDataMigrator(options: DataMigrationOptions): DataMigrator {
  return new DataMigrator(options);
}

// ==================== 便捷函数 ====================

/**
 * 快速迁移数据
 *
 * @param options - 迁移选项
 * @returns 迁移结果列表
 */
export async function migrateData(
  options: DataMigrationOptions
): Promise<MigrationResult[]> {
  const migrator = createDataMigrator(options);
  return migrator.migrateData();
}
