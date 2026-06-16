/**
 * 迁移模块入口
 *
 * 统一导出迁移相关的工具和类型
 */

// dexp 导出工具
export { DexpWrapper } from './dexp-wrapper';
export type { DexpOptions, DexpProgress, DexpProgressCallback, DexpResult } from './dexp-wrapper';

// dimp 导入工具
export { DimpWrapper } from './dimp-wrapper';
export type { DimpOptions, DimpProgress, DimpProgressCallback, DimpResult, TableExistsAction } from './dimp-wrapper';

// SQL 语法转换器
export {
  SqlConverter,
  type DatabaseType,
  type RuleCategory,
  type ConversionRule,
  type ConversionResult,
  type ConversionStats,
  type FileConvertOptions,
  type FileConvertResult,
  type BatchConvertResult,
  ORACLE_TO_DM_RULES,
  MYSQL_TO_DM_RULES,
  createSqlConverter,
  convertSql,
  convertSqlFile,
  convertSqlBatch,
  convertSqlDirectory,
  printConversionStats,
  printBatchConversionStats
} from './converter';

// 迁移兼容性检查器
export {
  MigrationChecker,
  createMigrationChecker,
  type MigrationCheckResult,
  type MigrationIssue,
  type IssueSeverity,
  type IssueCategory,
  type ReportFormat,
  type TableInfo,
  type ColumnInfo,
  type ProcedureInfo,
  type ViewInfo,
  type TriggerInfo,
  type SequenceInfo
} from './checker';

// 数据迁移器
export {
  DataMigrator,
  MigrationError,
  MIGRATION_ERROR_CODES,
  createDataMigrator,
  migrateData,
  type DatabaseConnector,
  type ReadStreamOptions,
  type BulkInsertOptions,
  type DataMigrationOptions,
  type MigrationResult,
  type MigrationProgress,
  type ProgressCallback
} from './data-migrator';

// 交互式迁移向导
export {
  MigrationWizard,
  runMigrationWizard,
  type DatabaseType as WizardDatabaseType,
  type MigrationType,
  type DatabaseConfig,
  type MigrationOptions,
  type MigrationConfig
} from './wizard';
