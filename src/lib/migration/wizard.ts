/**
 * 交互式迁移向导
 *
 * 引导用户通过交互式提示配置数据库迁移任务。
 * 支持多种迁移类型和数据库类型组合。
 *
 * 使用方式:
 *   const wizard = new MigrationWizard();
 *   const config = await wizard.run();
 *   if (config) {
 *     // 执行迁移...
 *   }
 */

import { input, password, select, confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';

// ==================== 类型定义 ====================

/**
 * 数据库类型
 */
export type DatabaseType = 'oracle' | 'mysql' | 'postgres' | 'sqlserver' | 'dm';

/**
 * 迁移类型
 */
export type MigrationType = 'full' | 'schema' | 'data' | 'export' | 'import' | 'convert' | 'diff';

/**
 * 数据库连接配置
 */
export interface DatabaseConfig {
  /** 数据库类型 */
  type: DatabaseType;
  /** 主机地址 */
  host: string;
  /** 端口号 */
  port: number;
  /** 用户名 */
  user: string;
  /** 密码 */
  password: string;
  /** 数据库名 */
  database: string;
  /** Schema 名（可选） */
  schema?: string;
}

/**
 * 迁移选项
 */
export interface MigrationOptions {
  /** 批量大小 */
  batchSize: number;
  /** 并行数 */
  parallel: number;
  /** 是否清空目标表 */
  truncateTarget: boolean;
  /** 是否忽略错误 */
  ignoreErrors: boolean;
  /** 是否生成日志 */
  enableLog: boolean;
  /** 日志文件路径 */
  logFile?: string;
}

/**
 * 迁移配置
 */
export interface MigrationConfig {
  /** 迁移类型 */
  migrationType: MigrationType;
  /** 源数据库配置 */
  source: DatabaseConfig;
  /** 目标数据库配置 */
  target: DatabaseConfig;
  /** 要迁移的对象类型列表 */
  objects: string[];
  /** 迁移选项 */
  options: MigrationOptions;
}

// ==================== 常量定义 ====================

/**
 * 迁移类型选项
 */
const MIGRATION_TYPE_CHOICES = [
  { name: '全量迁移 (结构 + 数据)', value: 'full' as const },
  { name: '仅结构迁移', value: 'schema' as const },
  { name: '仅数据迁移', value: 'data' as const },
  { name: '导出 (源数据库 → 文件)', value: 'export' as const },
  { name: '导入 (文件 → 目标数据库)', value: 'import' as const },
  { name: 'SQL 语法转换', value: 'convert' as const },
  { name: '结构对比 (差异分析)', value: 'diff' as const },
];

/**
 * 数据库类型选项
 */
const DATABASE_TYPE_CHOICES = [
  { name: 'Oracle', value: 'oracle' as const },
  { name: 'MySQL', value: 'mysql' as const },
  { name: 'PostgreSQL', value: 'postgres' as const },
  { name: 'SQL Server', value: 'sqlserver' as const },
  { name: 'DM (达梦)', value: 'dm' as const },
];

/**
 * 可迁移的对象类型
 */
const OBJECT_TYPE_CHOICES = [
  { name: '表 (Tables)', value: 'tables', checked: true },
  { name: '视图 (Views)', value: 'views', checked: true },
  { name: '存储过程 (Procedures)', value: 'procedures', checked: true },
  { name: '触发器 (Triggers)', value: 'triggers', checked: true },
  { name: '序列 (Sequences)', value: 'sequences', checked: true },
  { name: '索引 (Indexes)', value: 'indexes', checked: true },
  { name: '约束 (Constraints)', value: 'constraints', checked: true },
];

/**
 * 各数据库类型的默认端口
 */
const DEFAULT_PORTS: Record<DatabaseType, number> = {
  oracle: 1521,
  mysql: 3306,
  postgres: 5432,
  sqlserver: 1433,
  dm: 5236,
};

// ==================== 向导类 ====================

/**
 * 交互式迁移向导
 *
 * 通过一系列交互式提示引导用户完成迁移配置。
 * 用户可以随时按 Ctrl+C 取消操作。
 */
export class MigrationWizard {
  /**
   * 运行迁移向导
   *
   * @returns 迁移配置，如果用户取消则返回 null
   */
  async run(): Promise<MigrationConfig | null> {
    try {
      console.log(chalk.cyan.bold('\n=== 达梦数据库迁移向导 ===\n'));
      console.log(chalk.gray('按照提示配置迁移任务，随时按 Ctrl+C 取消\n'));

      // 步骤 1: 选择迁移类型
      const migrationType = await this.promptMigrationType();

      // 步骤 2: 配置源数据库
      console.log(chalk.cyan.bold('\n--- 源数据库配置 ---'));
      const source = await this.promptDatabaseConfig('源');

      // 步骤 3: 配置目标数据库
      console.log(chalk.cyan.bold('\n--- 目标数据库配置 ---'));
      const target = await this.promptDatabaseConfig('目标');

      // 步骤 4: 选择迁移对象（全量和结构迁移时需要）
      let objects: string[] = [];
      if (migrationType === 'full' || migrationType === 'schema') {
        objects = await this.promptObjectTypes();
      }

      // 步骤 5: 高级选项
      const options = await this.promptAdvancedOptions();

      // 步骤 6: 确认配置
      const config: MigrationConfig = {
        migrationType,
        source,
        target,
        objects,
        options,
      };

      const confirmed = await this.confirmConfig(config);
      if (!confirmed) {
        console.log(chalk.yellow('\n已取消迁移配置'));
        return null;
      }

      console.log(chalk.green.bold('\n配置完成！\n'));
      return config;
    } catch (error: unknown) {
      if (isInquirerCancel(error)) {
        console.log(chalk.yellow('\n已取消'));
        return null;
      }
      throw error;
    }
  }

  /**
   * 提示选择迁移类型
   */
  private async promptMigrationType(): Promise<MigrationType> {
    return select({
      message: '选择迁移类型:',
      choices: MIGRATION_TYPE_CHOICES,
    });
  }

  /**
   * 提示输入数据库配置
   *
   * @param label - 数据库标签（"源" 或 "目标"）
   */
  private async promptDatabaseConfig(label: string): Promise<DatabaseConfig> {
    const type = await select({
      message: `选择${label}数据库类型:`,
      choices: DATABASE_TYPE_CHOICES,
    });

    const defaultPort = DEFAULT_PORTS[type];

    const host = await input({
      message: `${label}数据库主机:`,
      default: 'localhost',
      validate: (value) => {
        if (!value.trim()) return '主机地址不能为空';
        return true;
      },
    });

    const portStr = await input({
      message: `${label}数据库端口:`,
      default: String(defaultPort),
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 65535) {
          return '端口号必须是 1-65535 之间的数字';
        }
        return true;
      },
    });

    const user = await input({
      message: `${label}数据库用户名:`,
      validate: (value) => {
        if (!value.trim()) return '用户名不能为空';
        return true;
      },
    });

    const pwd = await password({
      message: `${label}数据库密码:`,
      mask: '*',
      validate: (value) => {
        if (!value) return '密码不能为空';
        return true;
      },
    });

    const database = await input({
      message: `${label}数据库名:`,
      validate: (value) => {
        if (!value.trim()) return '数据库名不能为空';
        return true;
      },
    });

    const schema = await input({
      message: `${label}Schema 名 (可选，直接回车跳过):`,
    });

    return {
      type,
      host,
      port: parseInt(portStr, 10),
      user,
      password: pwd,
      database,
      schema: schema || undefined,
    };
  }

  /**
   * 提示选择要迁移的对象类型
   */
  private async promptObjectTypes(): Promise<string[]> {
    console.log(chalk.gray('\n选择要迁移的对象类型（空格选择/取消，回车确认）:'));

    const objects = await checkbox({
      message: '迁移对象:',
      choices: OBJECT_TYPE_CHOICES,
      required: true,
      validate: (value) => {
        if (value.length === 0) return '请至少选择一种对象类型';
        return true;
      },
    });

    return objects;
  }

  /**
   * 提示配置高级选项
   */
  private async promptAdvancedOptions(): Promise<MigrationOptions> {
    console.log(chalk.cyan.bold('\n--- 高级选项 ---'));

    const configureAdvanced = await confirm({
      message: '是否配置高级选项?',
      default: false,
    });

    if (!configureAdvanced) {
      return {
        batchSize: 1000,
        parallel: 4,
        truncateTarget: false,
        ignoreErrors: false,
        enableLog: true,
      };
    }

    const batchStr = await input({
      message: '批量大小 (每次处理的记录数):',
      default: '1000',
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) return '批量大小必须是正整数';
        return true;
      },
    });

    const parallelStr = await input({
      message: '并行线程数:',
      default: '4',
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 32) return '并行数必须是 1-32 之间的数字';
        return true;
      },
    });

    const truncateTarget = await confirm({
      message: '是否在迁移前清空目标表?',
      default: false,
    });

    const ignoreErrors = await confirm({
      message: '是否忽略迁移错误继续执行?',
      default: false,
    });

    const enableLog = await confirm({
      message: '是否启用迁移日志?',
      default: true,
    });

    let logFile: string | undefined;
    if (enableLog) {
      logFile = await input({
        message: '日志文件路径:',
        default: './migration.log',
      });
    }

    return {
      batchSize: parseInt(batchStr, 10),
      parallel: parseInt(parallelStr, 10),
      truncateTarget,
      ignoreErrors,
      enableLog,
      logFile,
    };
  }

  /**
   * 显示配置摘要并确认
   *
   * @param config - 迁移配置
   * @returns 是否确认
   */
  private async confirmConfig(config: MigrationConfig): Promise<boolean> {
    console.log(chalk.cyan.bold('\n=== 配置摘要 ===\n'));

    // 迁移类型
    const typeLabel = MIGRATION_TYPE_CHOICES.find((c) => c.value === config.migrationType)?.name;
    console.log(chalk.white('迁移类型:'), chalk.yellow(typeLabel || config.migrationType));

    // 源数据库
    console.log(chalk.white('\n源数据库:'));
    this.printDatabaseSummary(config.source);

    // 目标数据库
    console.log(chalk.white('\n目标数据库:'));
    this.printDatabaseSummary(config.target);

    // 迁移对象
    if (config.objects.length > 0) {
      console.log(chalk.white('\n迁移对象:'), chalk.yellow(config.objects.join(', ')));
    }

    // 高级选项
    console.log(chalk.white('\n高级选项:'));
    console.log(chalk.gray(`  批量大小: ${config.options.batchSize}`));
    console.log(chalk.gray(`  并行数: ${config.options.parallel}`));
    console.log(chalk.gray(`  清空目标表: ${config.options.truncateTarget ? '是' : '否'}`));
    console.log(chalk.gray(`  忽略错误: ${config.options.ignoreErrors ? '是' : '否'}`));
    console.log(chalk.gray(`  启用日志: ${config.options.enableLog ? '是' : '否'}`));
    if (config.options.logFile) {
      console.log(chalk.gray(`  日志文件: ${config.options.logFile}`));
    }

    console.log('');
    return confirm({
      message: '确认以上配置?',
      default: true,
    });
  }

  /**
   * 打印数据库配置摘要
   */
  private printDatabaseSummary(db: DatabaseConfig): void {
    const typeLabel = DATABASE_TYPE_CHOICES.find((c) => c.value === db.type)?.name;
    console.log(chalk.gray(`  类型: ${typeLabel || db.type}`));
    console.log(chalk.gray(`  主机: ${db.host}:${db.port}`));
    console.log(chalk.gray(`  用户: ${db.user}`));
    console.log(chalk.gray(`  数据库: ${db.database}`));
    if (db.schema) {
      console.log(chalk.gray(`  Schema: ${db.schema}`));
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 判断是否为 inquirer 用户取消操作
 */
function isInquirerCancel(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Cancelled') {
    return true;
  }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as any).name === 'ExitPromptError'
  ) {
    return true;
  }
  return false;
}

// ==================== 便捷函数 ====================

/**
 * 创建并运行迁移向导
 *
 * @returns 迁移配置，如果用户取消则返回 null
 */
export async function runMigrationWizard(): Promise<MigrationConfig | null> {
  const wizard = new MigrationWizard();
  return wizard.run();
}
