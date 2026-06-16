/**
 * Schema 迁移器
 *
 * 支持从 Oracle/MySQL/PostgreSQL/SQL Server 迁移 Schema 到达梦数据库（DM）。
 * 功能：
 * - 迁移表结构（含列定义、数据类型转换）
 * - 迁移视图
 * - 迁移存储过程
 * - 迁移触发器
 * - 迁移序列
 * - 迁移索引
 * - 迁移约束
 * - 生成 DDL 脚本（dryRun 模式）
 * - 直接执行 DDL
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { TypeMapper, DatabaseType as TypeMapperDatabaseType, createTypeMapper, MappingResult } from './type-mapper';
import { SqlConverter, createSqlConverter, ConversionResult, DatabaseType as ConverterDatabaseType } from './converter';

// ============================================================================
// 接口定义
// ============================================================================

/**
 * 数据库类型（使用 TypeMapper 的定义，包含所有支持的数据库）
 */
export type DatabaseType = TypeMapperDatabaseType;

/**
 * 数据库连接器接口
 */
export interface DatabaseConnector {
  /** 数据库类型 */
  type: DatabaseType;
  /** 连接主机 */
  host: string;
  /** 连接端口 */
  port: number;
  /** 数据库名 */
  database: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 连接字符串（可选） */
  connectionString?: string;

  /**
   * 执行 SQL 查询
   * @param sql - SQL 语句
   * @param params - 查询参数
   * @returns 查询结果
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * 执行 SQL 语句（无返回结果）
   * @param sql - SQL 语句
   * @param params - 执行参数
   */
  execute(sql: string, params?: any[]): Promise<void>;

  /**
   * 获取表列表
   * @param schema - Schema 名称
   * @returns 表名列表
   */
  getTables(schema: string): Promise<string[]>;

  /**
   * 获取表结构
   * @param schema - Schema 名称
   * @param table - 表名
   * @returns 表结构信息
   */
  getTableDefinition(schema: string, table: string): Promise<TableDefinition>;

  /**
   * 获取视图列表
   * @param schema - Schema 名称
   * @returns 视图名列表
   */
  getViews(schema: string): Promise<string[]>;

  /**
   * 获取视图定义
   * @param schema - Schema 名称
   * @param view - 视图名
   * @returns 视图定义
   */
  getViewDefinition(schema: string, view: string): Promise<ViewDefinition>;

  /**
   * 获取存储过程列表
   * @param schema - Schema 名称
   * @returns 存储过程名列表
   */
  getProcedures(schema: string): Promise<string[]>;

  /**
   * 获取存储过程定义
   * @param schema - Schema 名称
   * @param procedure - 存储过程名
   * @returns 存储过程定义
   */
  getProcedureDefinition(schema: string, procedure: string): Promise<ProcedureDefinition>;

  /**
   * 获取触发器列表
   * @param schema - Schema 名称
   * @returns 触发器名列表
   */
  getTriggers(schema: string): Promise<string[]>;

  /**
   * 获取触发器定义
   * @param schema - Schema 名称
   * @param trigger - 触发器名
   * @returns 触发器定义
   */
  getTriggerDefinition(schema: string, trigger: string): Promise<TriggerDefinition>;

  /**
   * 获取序列列表
   * @param schema - Schema 名称
   * @returns 序列名列表
   */
  getSequences(schema: string): Promise<string[]>;

  /**
   * 获取序列定义
   * @param schema - Schema 名称
   * @param sequence - 序列名
   * @returns 序列定义
   */
  getSequenceDefinition(schema: string, sequence: string): Promise<SequenceDefinition>;

  /**
   * 获取索引列表
   * @param schema - Schema 名称
   * @returns 索引名列表
   */
  getIndexes(schema: string): Promise<string[]>;

  /**
   * 获取索引定义
   * @param schema - Schema 名称
   * @param index - 索引名
   * @returns 索引定义
   */
  getIndexDefinition(schema: string, index: string): Promise<IndexDefinition>;

  /**
   * 获取约束列表
   * @param schema - Schema 名称
   * @returns 约束名列表
   */
  getConstraints(schema: string): Promise<string[]>;

  /**
   * 获取约束定义
   * @param schema - Schema 名称
   * @param constraint - 约束名
   * @returns 约束定义
   */
  getConstraintDefinition(schema: string, constraint: string): Promise<ConstraintDefinition>;

  /**
   * 测试连接
   * @returns 是否连接成功
   */
  testConnection(): Promise<boolean>;

  /**
   * 关闭连接
   */
  close(): Promise<void>;
}

/**
 * 列定义
 */
export interface ColumnDefinition {
  /** 列名 */
  name: string;
  /** 数据类型 */
  dataType: string;
  /** 类型参数（如 VARCHAR(100) 中的 100） */
  dataLength?: number;
  /** 精度（如 NUMBER(10,2) 中的 10） */
  precision?: number;
  /** 小数位数（如 NUMBER(10,2) 中的 2） */
  scale?: number;
  /** 是否可空 */
  nullable: boolean;
  /** 默认值 */
  defaultValue?: string;
  /** 注释 */
  comment?: string;
  /** 是否为主键 */
  isPrimaryKey?: boolean;
  /** 是否自增 */
  isIdentity?: boolean;
  /** 字符集（仅 MySQL） */
  characterSet?: string;
  /** 排序规则（仅 MySQL/SQL Server） */
  collation?: string;
}

/**
 * 表定义
 */
export interface TableDefinition {
  /** Schema 名称 */
  schema: string;
  /** 表名 */
  name: string;
  /** 列定义列表 */
  columns: ColumnDefinition[];
  /** 注释 */
  comment?: string;
  /** 表空间（Oracle/DM） */
  tablespace?: string;
  /** 存储参数（Oracle） */
  storage?: string;
}

/**
 * 视图定义
 */
export interface ViewDefinition {
  /** Schema 名称 */
  schema: string;
  /** 视图名 */
  name: string;
  /** SQL 定义 */
  sql: string;
  /** 注释 */
  comment?: string;
}

/**
 * 存储过程定义
 */
export interface ProcedureDefinition {
  /** Schema 名称 */
  schema: string;
  /** 存储过程名 */
  name: string;
  /** SQL 定义 */
  sql: string;
  /** 参数列表 */
  parameters?: ProcedureParameter[];
  /** 注释 */
  comment?: string;
}

/**
 * 存储过程参数
 */
export interface ProcedureParameter {
  /** 参数名 */
  name: string;
  /** 数据类型 */
  dataType: string;
  /** 参数模式（IN/OUT/INOUT） */
  mode: 'IN' | 'OUT' | 'INOUT';
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 触发器定义
 */
export interface TriggerDefinition {
  /** Schema 名称 */
  schema: string;
  /** 触发器名 */
  name: string;
  /** SQL 定义 */
  sql: string;
  /** 触发事件（INSERT/UPDATE/DELETE） */
  event: string;
  /** 触发时机（BEFORE/AFTER） */
  timing: string;
  /** 关联表 */
  tableName: string;
  /** 注释 */
  comment?: string;
}

/**
 * 序列定义
 */
export interface SequenceDefinition {
  /** Schema 名称 */
  schema: string;
  /** 序列名 */
  name: string;
  /** 最小值 */
  minValue?: number;
  /** 最大值 */
  maxValue?: number;
  /** 当前值 */
  currentValue?: number;
  /** 步长 */
  incrementBy: number;
  /** 是否循环 */
  cycle: boolean;
  /** 缓存大小 */
  cacheSize?: number;
  /** 注释 */
  comment?: string;
}

/**
 * 索引定义
 */
export interface IndexDefinition {
  /** Schema 名称 */
  schema: string;
  /** 索引名 */
  name: string;
  /** 关联表 */
  tableName: string;
  /** 索引列 */
  columns: IndexColumn[];
  /** 是否唯一索引 */
  unique: boolean;
  /** 索引类型（NORMAL/BITMAP/FUNCTION-BASED） */
  indexType?: string;
  /** 表空间 */
  tablespace?: string;
}

/**
 * 索引列
 */
export interface IndexColumn {
  /** 列名 */
  name: string;
  /** 排序方向（ASC/DESC） */
  direction?: 'ASC' | 'DESC';
  /** 列位置 */
  position: number;
}

/**
 * 约束定义
 */
export interface ConstraintDefinition {
  /** Schema 名称 */
  schema: string;
  /** 约束名 */
  name: string;
  /** 约束类型 */
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'NOT NULL';
  /** 关联表 */
  tableName: string;
  /** 约束列 */
  columns: string[];
  /** 外键引用表 */
  referencedTable?: string;
  /** 外键引用列 */
  referencedColumns?: string[];
  /** 删除规则（CASCADE/SET NULL/NO ACTION） */
  deleteRule?: string;
  /** 更新规则 */
  updateRule?: string;
  /** CHECK 表达式 */
  checkExpression?: string;
  /** 是否可延迟 */
  deferrable?: boolean;
  /** 初始延迟 */
  initiallyDeferred?: boolean;
  /** 注释 */
  comment?: string;
}

// ============================================================================
// 迁移选项和结果
// ============================================================================

/**
 * Schema 迁移选项
 */
export interface SchemaMigrationOptions {
  /** 源数据库连接器 */
  source: DatabaseConnector;
  /** 目标数据库连接器 */
  target: DatabaseConnector;
  /** 要迁移的 Schema 列表 */
  schemas: string[];
  /** 要迁移的对象类型 */
  objects: MigrationObjectType[];
  /** 是否转换数据类型 */
  convertTypes: boolean;
  /** 是否转换 SQL 语法 */
  convertSyntax: boolean;
  /** 是否创建 Schema */
  createSchema: boolean;
  /** 是否为 dryRun 模式（仅生成 DDL，不执行） */
  dryRun: boolean;
  /** 输出文件路径（dryRun 模式时使用） */
  outputFile?: string;
  /** 是否输出详细日志 */
  verbose?: boolean;
}

/**
 * 迁移对象类型
 */
export type MigrationObjectType =
  | 'table'
  | 'view'
  | 'procedure'
  | 'trigger'
  | 'sequence'
  | 'index'
  | 'constraint';

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移的对象总数 */
  totalObjects: number;
  /** 成功迁移的对象数 */
  successCount: number;
  /** 失败的对象数 */
  failureCount: number;
  /** 按类型统计 */
  byType: Record<MigrationObjectType, MigrationTypeStats>;
  /** 生成的 DDL 脚本 */
  ddlScripts: DdlScript[];
  /** 错误列表 */
  errors: MigrationError[];
  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 按类型统计
 */
export interface MigrationTypeStats {
  /** 总数 */
  total: number;
  /** 成功数 */
  success: number;
  /** 失败数 */
  failure: number;
  /** 对象列表 */
  objects: string[];
}

/**
 * DDL 脚本
 */
export interface DdlScript {
  /** 脚本类型 */
  type: MigrationObjectType;
  /** 对象名称 */
  objectName: string;
  /** Schema 名称 */
  schema: string;
  /** SQL 内容 */
  sql: string;
  /** 是否已执行 */
  executed: boolean;
  /** 执行错误 */
  error?: string;
}

/**
 * 迁移错误
 */
export interface MigrationError {
  /** 对象类型 */
  objectType: MigrationObjectType;
  /** Schema 名称 */
  schema: string;
  /** 对象名称 */
  objectName: string;
  /** 错误信息 */
  message: string;
  /** 原始错误 */
  originalError?: Error;
}

// ============================================================================
// Schema 迁移器实现
// ============================================================================

/**
 * Schema 迁移器
 *
 * 用于将数据库 Schema 从源数据库迁移到达梦数据库（DM）。
 *
 * @example
 * ```typescript
 * const migrator = new SchemaMigrator();
 *
 * const result = await migrator.migrateSchema({
 *   source: oracleConnector,
 *   target: dmConnector,
 *   schemas: ['HR', 'SCOTT'],
 *   objects: ['table', 'view', 'index'],
 *   convertTypes: true,
 *   convertSyntax: true,
 *   createSchema: true,
 *   dryRun: false,
 *   verbose: true
 * });
 *
 * console.log(`迁移完成: ${result.successCount}/${result.totalObjects}`);
 * ```
 */
export class SchemaMigrator {
  /** 类型映射器缓存 */
  private typeMappers: Map<DatabaseType, TypeMapper> = new Map();

  /**
   * 迁移整个 Schema
   *
   * @param options - 迁移选项
   * @returns 迁移结果
   */
  async migrateSchema(options: SchemaMigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      // 验证连接
      await this.validateConnections(options.source, options.target);

      // 如果需要创建 Schema
      if (options.createSchema) {
        await this.createSchemas(options.target, options.schemas, options.dryRun, result);
      }

      // 按顺序迁移各类型对象
      const migrationOrder: MigrationObjectType[] = [
        'sequence',
        'table',
        'view',
        'index',
        'constraint',
        'trigger',
        'procedure'
      ];

      for (const objectType of migrationOrder) {
        if (options.objects.includes(objectType)) {
          await this.migrateObjectType(options, objectType, result);
        }
      }

      // 如果是 dryRun 模式，输出 DDL 脚本
      if (options.dryRun && options.outputFile) {
        await this.writeDdlScripts(options.outputFile, result.ddlScripts);
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        objectType: 'table',
        schema: '',
        objectName: '',
        message: error instanceof Error ? error.message : String(error),
        originalError: error instanceof Error ? error : undefined
      });
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移表结构
   *
   * @param options - 迁移选项
   * @param tables - 表定义列表（可选，不提供则从源数据库获取）
   * @returns 迁移结果
   */
  async migrateTables(
    options: SchemaMigrationOptions,
    tables?: TableDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let tableDefs = tables;

        // 如果未提供表定义，从源数据库获取
        if (!tableDefs) {
          const tableNames = await options.source.getTables(schema);
          tableDefs = [];
          for (const tableName of tableNames) {
            const def = await options.source.getTableDefinition(schema, tableName);
            tableDefs.push(def);
          }
        }

        result.totalObjects += tableDefs.length;
        result.byType.table.total += tableDefs.length;

        for (const tableDef of tableDefs) {
          try {
            const ddl = this.generateCreateTableDdl(tableDef, options);
            result.ddlScripts.push({
              type: 'table',
              objectName: tableDef.name,
              schema,
              sql: ddl,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(ddl);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.table.success++;
            result.byType.table.objects.push(tableDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 表 ${schema}.${tableDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.table.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'table',
              schema,
              objectName: tableDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });

            if (options.verbose) {
              console.log(chalk.red(`  [FAIL] 表 ${schema}.${tableDef.name}: ${errorMsg}`));
            }
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移视图
   *
   * @param options - 迁移选项
   * @param views - 视图定义列表（可选）
   * @returns 迁移结果
   */
  async migrateViews(
    options: SchemaMigrationOptions,
    views?: ViewDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let viewDefs = views;

        if (!viewDefs) {
          const viewNames = await options.source.getViews(schema);
          viewDefs = [];
          for (const viewName of viewNames) {
            const def = await options.source.getViewDefinition(schema, viewName);
            viewDefs.push(def);
          }
        }

        result.totalObjects += viewDefs.length;
        result.byType.view.total += viewDefs.length;

        for (const viewDef of viewDefs) {
          try {
            let sql = viewDef.sql;

            // 转换 SQL 语法
            if (options.convertSyntax) {
              sql = this.convertSqlSyntax(sql, options.source.type);
            }

            const ddl = `CREATE OR REPLACE VIEW ${schema}.${viewDef.name} AS\n${sql};`;

            result.ddlScripts.push({
              type: 'view',
              objectName: viewDef.name,
              schema,
              sql: ddl,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(ddl);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.view.success++;
            result.byType.view.objects.push(viewDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 视图 ${schema}.${viewDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.view.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'view',
              schema,
              objectName: viewDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移存储过程
   *
   * @param options - 迁移选项
   * @param procedures - 存储过程定义列表（可选）
   * @returns 迁移结果
   */
  async migrateProcedures(
    options: SchemaMigrationOptions,
    procedures?: ProcedureDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let procDefs = procedures;

        if (!procDefs) {
          const procNames = await options.source.getProcedures(schema);
          procDefs = [];
          for (const procName of procNames) {
            const def = await options.source.getProcedureDefinition(schema, procName);
            procDefs.push(def);
          }
        }

        result.totalObjects += procDefs.length;
        result.byType.procedure.total += procDefs.length;

        for (const procDef of procDefs) {
          try {
            let sql = procDef.sql;

            // 转换 SQL 语法
            if (options.convertSyntax) {
              sql = this.convertSqlSyntax(sql, options.source.type);
            }

            result.ddlScripts.push({
              type: 'procedure',
              objectName: procDef.name,
              schema,
              sql,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(sql);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.procedure.success++;
            result.byType.procedure.objects.push(procDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 存储过程 ${schema}.${procDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.procedure.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'procedure',
              schema,
              objectName: procDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移触发器
   *
   * @param options - 迁移选项
   * @param triggers - 触发器定义列表（可选）
   * @returns 迁移结果
   */
  async migrateTriggers(
    options: SchemaMigrationOptions,
    triggers?: TriggerDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let triggerDefs = triggers;

        if (!triggerDefs) {
          const triggerNames = await options.source.getTriggers(schema);
          triggerDefs = [];
          for (const triggerName of triggerNames) {
            const def = await options.source.getTriggerDefinition(schema, triggerName);
            triggerDefs.push(def);
          }
        }

        result.totalObjects += triggerDefs.length;
        result.byType.trigger.total += triggerDefs.length;

        for (const triggerDef of triggerDefs) {
          try {
            let sql = triggerDef.sql;

            // 转换 SQL 语法
            if (options.convertSyntax) {
              sql = this.convertSqlSyntax(sql, options.source.type);
            }

            result.ddlScripts.push({
              type: 'trigger',
              objectName: triggerDef.name,
              schema,
              sql,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(sql);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.trigger.success++;
            result.byType.trigger.objects.push(triggerDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 触发器 ${schema}.${triggerDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.trigger.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'trigger',
              schema,
              objectName: triggerDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移序列
   *
   * @param options - 迁移选项
   * @param sequences - 序列定义列表（可选）
   * @returns 迁移结果
   */
  async migrateSequences(
    options: SchemaMigrationOptions,
    sequences?: SequenceDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let seqDefs = sequences;

        if (!seqDefs) {
          const seqNames = await options.source.getSequences(schema);
          seqDefs = [];
          for (const seqName of seqNames) {
            const def = await options.source.getSequenceDefinition(schema, seqName);
            seqDefs.push(def);
          }
        }

        result.totalObjects += seqDefs.length;
        result.byType.sequence.total += seqDefs.length;

        for (const seqDef of seqDefs) {
          try {
            const ddl = this.generateCreateSequenceDdl(seqDef, schema);

            result.ddlScripts.push({
              type: 'sequence',
              objectName: seqDef.name,
              schema,
              sql: ddl,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(ddl);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.sequence.success++;
            result.byType.sequence.objects.push(seqDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 序列 ${schema}.${seqDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.sequence.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'sequence',
              schema,
              objectName: seqDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移索引
   *
   * @param options - 迁移选项
   * @param indexes - 索引定义列表（可选）
   * @returns 迁移结果
   */
  async migrateIndexes(
    options: SchemaMigrationOptions,
    indexes?: IndexDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let indexDefs = indexes;

        if (!indexDefs) {
          const indexNames = await options.source.getIndexes(schema);
          indexDefs = [];
          for (const indexName of indexNames) {
            const def = await options.source.getIndexDefinition(schema, indexName);
            indexDefs.push(def);
          }
        }

        result.totalObjects += indexDefs.length;
        result.byType.index.total += indexDefs.length;

        for (const indexDef of indexDefs) {
          try {
            const ddl = this.generateCreateIndexDdl(indexDef, schema);

            result.ddlScripts.push({
              type: 'index',
              objectName: indexDef.name,
              schema,
              sql: ddl,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(ddl);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.index.success++;
            result.byType.index.objects.push(indexDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 索引 ${schema}.${indexDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.index.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'index',
              schema,
              objectName: indexDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * 迁移约束
   *
   * @param options - 迁移选项
   * @param constraints - 约束定义列表（可选）
   * @returns 迁移结果
   */
  async migrateConstraints(
    options: SchemaMigrationOptions,
    constraints?: ConstraintDefinition[]
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalObjects: 0,
      successCount: 0,
      failureCount: 0,
      byType: this.initTypeStats(),
      ddlScripts: [],
      errors: [],
      duration: 0
    };

    try {
      for (const schema of options.schemas) {
        let constraintDefs = constraints;

        if (!constraintDefs) {
          const constraintNames = await options.source.getConstraints(schema);
          constraintDefs = [];
          for (const constraintName of constraintNames) {
            const def = await options.source.getConstraintDefinition(schema, constraintName);
            constraintDefs.push(def);
          }
        }

        result.totalObjects += constraintDefs.length;
        result.byType.constraint.total += constraintDefs.length;

        for (const constraintDef of constraintDefs) {
          try {
            const ddl = this.generateAddConstraintDdl(constraintDef, schema);

            result.ddlScripts.push({
              type: 'constraint',
              objectName: constraintDef.name,
              schema,
              sql: ddl,
              executed: false
            });

            if (!options.dryRun) {
              await options.target.execute(ddl);
              result.ddlScripts[result.ddlScripts.length - 1].executed = true;
            }

            result.successCount++;
            result.byType.constraint.success++;
            result.byType.constraint.objects.push(constraintDef.name);

            if (options.verbose) {
              console.log(chalk.green(`  [OK] 约束 ${schema}.${constraintDef.name}`));
            }
          } catch (error) {
            result.failureCount++;
            result.byType.constraint.failure++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              objectType: 'constraint',
              schema,
              objectName: constraintDef.name,
              message: errorMsg,
              originalError: error instanceof Error ? error : undefined
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    result.success = result.errors.length === 0;

    return result;
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 获取类型映射器
   */
  private getTypeMapper(sourceType: DatabaseType): TypeMapper {
    if (!this.typeMappers.has(sourceType)) {
      this.typeMappers.set(sourceType, createTypeMapper(sourceType));
    }
    return this.typeMappers.get(sourceType)!;
  }

  /**
   * 转换 SQL 语法
   */
  private convertSqlSyntax(sql: string, sourceType: DatabaseType): string {
    try {
      // Converter 仅支持 oracle/mysql，其他类型直接返回
      if (sourceType !== 'oracle' && sourceType !== 'mysql') {
        return sql;
      }
      const converter = createSqlConverter({ from: sourceType as ConverterDatabaseType, to: 'dm' });
      const result = converter.convert(sql);
      return result.converted;
    } catch {
      // 如果转换失败，返回原始 SQL
      return sql;
    }
  }

  /**
   * 转换数据类型
   */
  private convertDataType(
    dataType: string,
    dataLength?: number,
    precision?: number,
    scale?: number,
    sourceType?: DatabaseType
  ): string {
    if (!sourceType) return dataType;

    const mapper = this.getTypeMapper(sourceType);

    // 构建类型参数
    let params: string | undefined;
    if (precision !== undefined && scale !== undefined) {
      params = `${precision},${scale}`;
    } else if (precision !== undefined) {
      params = `${precision}`;
    } else if (dataLength !== undefined) {
      params = `${dataLength}`;
    }

    const result = mapper.mapType(dataType, params);

    if (result.params) {
      return `${result.type}(${result.params})`;
    }
    return result.type;
  }

  /**
   * 验证数据库连接
   */
  private async validateConnections(
    source: DatabaseConnector,
    target: DatabaseConnector
  ): Promise<void> {
    const sourceOk = await source.testConnection();
    if (!sourceOk) {
      throw new Error('源数据库连接失败');
    }

    const targetOk = await target.testConnection();
    if (!targetOk) {
      throw new Error('目标数据库连接失败');
    }
  }

  /**
   * 创建 Schema
   */
  private async createSchemas(
    target: DatabaseConnector,
    schemas: string[],
    dryRun: boolean,
    result: MigrationResult
  ): Promise<void> {
    for (const schema of schemas) {
      const ddl = `CREATE SCHEMA IF NOT EXISTS ${schema};`;

      result.ddlScripts.push({
        type: 'table',
        objectName: `SCHEMA_${schema}`,
        schema,
        sql: ddl,
        executed: false
      });

      if (!dryRun) {
        try {
          await target.execute(ddl);
          result.ddlScripts[result.ddlScripts.length - 1].executed = true;
        } catch (error) {
          // Schema 可能已存在，忽略错误
        }
      }
    }
  }

  /**
   * 迁移指定类型的对象
   */
  private async migrateObjectType(
    options: SchemaMigrationOptions,
    objectType: MigrationObjectType,
    result: MigrationResult
  ): Promise<void> {
    if (options.verbose) {
      console.log(chalk.cyan(`\n迁移 ${objectType}...`));
    }

    let typeResult: MigrationResult;

    switch (objectType) {
      case 'table':
        typeResult = await this.migrateTables(options);
        break;
      case 'view':
        typeResult = await this.migrateViews(options);
        break;
      case 'procedure':
        typeResult = await this.migrateProcedures(options);
        break;
      case 'trigger':
        typeResult = await this.migrateTriggers(options);
        break;
      case 'sequence':
        typeResult = await this.migrateSequences(options);
        break;
      case 'index':
        typeResult = await this.migrateIndexes(options);
        break;
      case 'constraint':
        typeResult = await this.migrateConstraints(options);
        break;
      default:
        return;
    }

    // 合并结果
    result.totalObjects += typeResult.totalObjects;
    result.successCount += typeResult.successCount;
    result.failureCount += typeResult.failureCount;
    result.ddlScripts.push(...typeResult.ddlScripts);
    result.errors.push(...typeResult.errors);
    result.byType[objectType] = typeResult.byType[objectType];
  }

  /**
   * 生成 CREATE TABLE DDL
   */
  private generateCreateTableDdl(tableDef: TableDefinition, options: SchemaMigrationOptions): string {
    const lines: string[] = [];
    const schema = tableDef.schema;

    lines.push(`CREATE TABLE ${schema}.${tableDef.name} (`);

    const columnDefs: string[] = [];
    const primaryKeys: string[] = [];

    for (const col of tableDef.columns) {
      let dataType = col.dataType;

      // 转换数据类型
      if (options.convertTypes) {
        dataType = this.convertDataType(
          col.dataType,
          col.dataLength,
          col.precision,
          col.scale,
          options.source.type
        );
      } else {
        // 保留原参数
        if (col.precision !== undefined && col.scale !== undefined) {
          dataType = `${col.dataType}(${col.precision},${col.scale})`;
        } else if (col.precision !== undefined) {
          dataType = `${col.dataType}(${col.precision})`;
        } else if (col.dataLength !== undefined) {
          dataType = `${col.dataType}(${col.dataLength})`;
        }
      }

      let colDef = `  ${col.name} ${dataType}`;

      // 自增属性
      if (col.isIdentity) {
        colDef += ' IDENTITY(1,1)';
      }

      // 非空约束
      if (!col.nullable) {
        colDef += ' NOT NULL';
      }

      // 默认值
      if (col.defaultValue !== undefined) {
        let defaultVal = col.defaultValue;
        // 转换默认值中的语法
        if (options.convertSyntax) {
          defaultVal = this.convertSqlSyntax(defaultVal, options.source.type);
        }
        colDef += ` DEFAULT ${defaultVal}`;
      }

      columnDefs.push(colDef);

      // 收集主键列
      if (col.isPrimaryKey) {
        primaryKeys.push(col.name);
      }
    }

    // 添加主键约束
    if (primaryKeys.length > 0) {
      columnDefs.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
    }

    lines.push(columnDefs.join(',\n'));
    lines.push(');');

    // 添加表注释
    if (tableDef.comment) {
      lines.push(`COMMENT ON TABLE ${schema}.${tableDef.name} IS '${tableDef.comment}';`);
    }

    // 添加列注释
    for (const col of tableDef.columns) {
      if (col.comment) {
        lines.push(`COMMENT ON COLUMN ${schema}.${tableDef.name}.${col.name} IS '${col.comment}';`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成 CREATE SEQUENCE DDL
   */
  private generateCreateSequenceDdl(seqDef: SequenceDefinition, schema: string): string {
    const lines: string[] = [];

    lines.push(`CREATE SEQUENCE ${schema}.${seqDef.name}`);

    if (seqDef.minValue !== undefined) {
      lines.push(`  MINVALUE ${seqDef.minValue}`);
    }

    if (seqDef.maxValue !== undefined) {
      lines.push(`  MAXVALUE ${seqDef.maxValue}`);
    }

    lines.push(`  INCREMENT BY ${seqDef.incrementBy}`);

    if (seqDef.cycle) {
      lines.push('  CYCLE');
    } else {
      lines.push('  NOCYCLE');
    }

    if (seqDef.cacheSize !== undefined) {
      lines.push(`  CACHE ${seqDef.cacheSize}`);
    }

    lines.push(';');

    return lines.join('\n');
  }

  /**
   * 生成 CREATE INDEX DDL
   */
  private generateCreateIndexDdl(indexDef: IndexDefinition, schema: string): string {
    const uniqueStr = indexDef.unique ? 'UNIQUE ' : '';
    const columns = indexDef.columns
      .sort((a, b) => a.position - b.position)
      .map(col => {
        const dir = col.direction || 'ASC';
        return `${col.name} ${dir}`;
      })
      .join(', ');

    return `CREATE ${uniqueStr}INDEX ${schema}.${indexDef.name} ON ${schema}.${indexDef.tableName} (${columns});`;
  }

  /**
   * 生成 ADD CONSTRAINT DDL
   */
  private generateAddConstraintDdl(constraintDef: ConstraintDefinition, schema: string): string {
    const tableRef = `${schema}.${constraintDef.tableName}`;
    const columns = constraintDef.columns.join(', ');

    switch (constraintDef.type) {
      case 'PRIMARY KEY':
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintDef.name} PRIMARY KEY (${columns});`;

      case 'UNIQUE':
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintDef.name} UNIQUE (${columns});`;

      case 'FOREIGN KEY': {
        const refTable = `${schema}.${constraintDef.referencedTable}`;
        const refColumns = constraintDef.referencedColumns?.join(', ') || '';
        let ddl = `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintDef.name} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;

        if (constraintDef.deleteRule) {
          ddl += ` ON DELETE ${constraintDef.deleteRule}`;
        }

        ddl += ';';
        return ddl;
      }

      case 'CHECK':
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintDef.name} CHECK (${constraintDef.checkExpression});`;

      case 'NOT NULL':
        // NOT NULL 通常通过 ALTER COLUMN 实现
        return `ALTER TABLE ${tableRef} MODIFY ${constraintDef.columns[0]} NOT NULL;`;

      default:
        throw new Error(`不支持的约束类型: ${constraintDef.type}`);
    }
  }

  /**
   * 初始化类型统计
   */
  private initTypeStats(): Record<MigrationObjectType, MigrationTypeStats> {
    return {
      table: { total: 0, success: 0, failure: 0, objects: [] },
      view: { total: 0, success: 0, failure: 0, objects: [] },
      procedure: { total: 0, success: 0, failure: 0, objects: [] },
      trigger: { total: 0, success: 0, failure: 0, objects: [] },
      sequence: { total: 0, success: 0, failure: 0, objects: [] },
      index: { total: 0, success: 0, failure: 0, objects: [] },
      constraint: { total: 0, success: 0, failure: 0, objects: [] }
    };
  }

  /**
   * 写入 DDL 脚本文件
   */
  private async writeDdlScripts(outputFile: string, scripts: DdlScript[]): Promise<void> {
    const lines: string[] = [];

    lines.push('-- ============================================');
    lines.push('-- Schema 迁移 DDL 脚本');
    lines.push(`-- 生成时间: ${new Date().toISOString()}`);
    lines.push('-- ============================================');
    lines.push('');

    // 按类型分组
    const grouped = new Map<MigrationObjectType, DdlScript[]>();
    for (const script of scripts) {
      if (!grouped.has(script.type)) {
        grouped.set(script.type, []);
      }
      grouped.get(script.type)!.push(script);
    }

    // 按顺序输出
    const order: MigrationObjectType[] = [
      'sequence',
      'table',
      'view',
      'index',
      'constraint',
      'trigger',
      'procedure'
    ];

    for (const type of order) {
      const typeScripts = grouped.get(type);
      if (!typeScripts || typeScripts.length === 0) continue;

      lines.push(`-- ${type.toUpperCase()} 对象`);
      lines.push('-- ' + '-'.repeat(40));
      lines.push('');

      for (const script of typeScripts) {
        lines.push(`-- ${script.schema}.${script.objectName}`);
        lines.push(script.sql);
        lines.push('');
      }
    }

    // 确保输出目录存在
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 Schema 迁移器实例
 *
 * @returns SchemaMigrator 实例
 *
 * @example
 * ```typescript
 * const migrator = createSchemaMigrator();
 * const result = await migrator.migrateSchema(options);
 * ```
 */
export function createSchemaMigrator(): SchemaMigrator {
  return new SchemaMigrator();
}

/**
 * 快速迁移 Schema（便捷函数）
 *
 * @param options - 迁移选项
 * @returns 迁移结果
 *
 * @example
 * ```typescript
 * const result = await migrateSchema({
 *   source: oracleConnector,
 *   target: dmConnector,
 *   schemas: ['HR'],
 *   objects: ['table', 'view'],
 *   convertTypes: true,
 *   convertSyntax: true,
 *   createSchema: true,
 *   dryRun: false
 * });
 * ```
 */
export async function migrateSchema(options: SchemaMigrationOptions): Promise<MigrationResult> {
  const migrator = createSchemaMigrator();
  return migrator.migrateSchema(options);
}

/**
 * 打印迁移结果统计
 *
 * @param result - 迁移结果
 */
export function printMigrationResult(result: MigrationResult): void {
  console.log(chalk.cyan('\n========================================'));
  console.log(chalk.cyan('        Schema 迁移结果统计'));
  console.log(chalk.cyan('========================================\n'));

  console.log(chalk.white(`总对象数: ${result.totalObjects}`));
  console.log(chalk.green(`成功: ${result.successCount}`));
  console.log(chalk.red(`失败: ${result.failureCount}`));
  console.log(chalk.white(`耗时: ${(result.duration / 1000).toFixed(2)}s`));

  // 按类型统计
  console.log(chalk.cyan('\n按类型统计:'));
  for (const [type, stats] of Object.entries(result.byType)) {
    if (stats.total > 0) {
      console.log(chalk.white(`  ${type}: ${stats.success}/${stats.total} 成功`));
    }
  }

  // 错误列表
  if (result.errors.length > 0) {
    console.log(chalk.red('\n错误列表:'));
    for (const error of result.errors) {
      console.log(chalk.red(`  - [${error.objectType}] ${error.schema}.${error.objectName}: ${error.message}`));
    }
  }

  console.log(chalk.cyan('\n========================================\n'));
}