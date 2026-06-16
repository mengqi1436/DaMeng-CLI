# 达梦数据库 CLI - 数据库迁移功能方案

> 基于 Commander.js、Knex.js、TypeORM、Inquirer.js 等最佳实践设计

## 一、架构设计

### 1.1 命令结构（基于 Commander.js 最佳实践）

```typescript
// src/commands/migrate.ts
import { Command } from 'commander';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';

export function migrateCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('migrate')
    .description('数据库迁移工具')
    .alias('mig');

  // 子命令注册（Commander.js 最佳实践：使用 .addCommand() 组织复杂子命令）
  cmd.addCommand(createCheckCommand(configManager, connectionManager));
  cmd.addCommand(createSchemaCommand(configManager, connectionManager));
  cmd.addCommand(createDataCommand(configManager, connectionManager));
  cmd.addCommand(createFullCommand(configManager, connectionManager));
  cmd.addCommand(createExportCommand(configManager, connectionManager));
  cmd.addCommand(createImportCommand(configManager, connectionManager));
  cmd.addCommand(createConvertSqlCommand());
  cmd.addCommand(createDiffCommand(configManager, connectionManager));

  return cmd;
}
```

### 1.2 模块结构

```
src/
├── commands/
│   └── migrate.ts              # 迁移命令入口
├── lib/
│   ├── migration/
│   │   ├── index.ts            # 迁移模块入口
│   │   ├── checker.ts          # 迁移检查器
│   │   ├── converter.ts        # SQL 语法转换器
│   │   ├── type-mapper.ts      # 数据类型映射
│   │   ├── schema-migrator.ts  # Schema 迁移器
│   │   ├── data-migrator.ts    # 数据迁移器
│   │   ├── dexp-wrapper.ts     # dexp 命令封装
│   │   └── dimp-wrapper.ts     # dimp 命令封装
│   ├── connectors/             # 多数据库连接器
│   │   ├── oracle.ts
│   │   ├── mysql.ts
│   │   ├── postgres.ts
│   │   ├── sqlserver.ts
│   │   └── index.ts
│   └── ...
```

---

## 二、命令实现

### 2.1 迁移检查命令 (`dm migrate check`)

**功能**：迁移前兼容性分析，检查数据类型、SQL 语法、存储过程等兼容性问题

```typescript
// src/commands/migrate/check.ts
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { input, select, confirm } from '@inquirer/prompts';

export function createCheckCommand(configManager, connectionManager): Command {
  return new Command('check')
    .description('迁移前兼容性检查')
    .option('-s, --source <type>', '源数据库类型 (oracle|mysql|postgres|sqlserver|dm)')
    .option('--source-conn <connection>', '源数据库连接字符串')
    .option('-t, --target <type>', '目标数据库类型', 'dm')
    .option('--target-conn <name>', '目标数据库连接名')
    .option('--schemas <schemas>', '要检查的 Schema（逗号分隔）')
    .option('--tables <tables>', '要检查的表（逗号分隔）')
    .option('-o, --output <file>', '输出报告文件')
    .option('-f, --format <format>', '报告格式 (text|json|html)', 'text')
    .action(async (options) => {
      const spinner = ora('正在分析迁移兼容性...').start();

      try {
        // 1. 连接源数据库
        // 2. 获取源数据库结构
        // 3. 执行兼容性检查
        // 4. 生成报告

        spinner.succeed('兼容性检查完成');
      } catch (error) {
        spinner.fail('兼容性检查失败');
        throw error;
      }
    });
}
```

**检查项**：

```typescript
// src/lib/migration/checker.ts
interface MigrationCheckResult {
  source: DatabaseType;
  target: DatabaseType;
  summary: {
    totalTables: number;
    totalViews: number;
    totalProcedures: number;
    totalFunctions: number;
    totalTriggers: number;
    totalSequences: number;
    compatibilityScore: number; // 0-100
  };
  issues: MigrationIssue[];
  recommendations: string[];
}

interface MigrationIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'datatype' | 'syntax' | 'object' | 'constraint' | 'index';
  object: string;
  column?: string;
  message: string;
  sourceDefinition?: string;
  targetDefinition?: string;
  solution?: string;
  autoFixable: boolean;
}
```

### 2.2 SQL 语法转换命令 (`dm migrate convert-sql`)

**功能**：将 Oracle/MySQL SQL 语法转换为 DM 兼容语法

```typescript
// src/commands/migrate/convert-sql.ts
import { Command } from 'commander';
import fs from 'fs';
import chalk from 'chalk';

export function createConvertSqlCommand(): Command {
  return new Command('convert-sql')
    .description('SQL 语法转换')
    .argument('[input]', '输入 SQL 文件或目录')
    .option('-f, --from <type>', '源数据库类型 (oracle|mysql)', 'oracle')
    .option('-t, --to <type>', '目标数据库类型', 'dm')
    .option('-o, --output <file>', '输出文件')
    .option('--in-place', '就地修改文件', false)
    .option('--dry-run', '仅显示转换结果，不写入文件', false)
    .option('--rules <rules>', '启用的规则集 (all|basic|advanced)', 'all')
    .action(async (input, options) => {
      // 读取 SQL 文件
      // 应用转换规则
      // 输出转换结果
    });
}
```

**转换规则**（基于 Oracle → DM 最佳实践）：

```typescript
// src/lib/migration/converter.ts
interface ConversionRule {
  id: string;
  name: string;
  description: string;
  category: 'syntax' | 'function' | 'type' | 'keyword';
  source: DatabaseType;
  pattern: RegExp;
  replacement: string | ((match: RegExpMatchArray) => string);
  examples: Array<{ before: string; after: string }>;
}

// Oracle → DM 转换规则
export const ORACLE_TO_DM_RULES: ConversionRule[] = [
  // 1. ROWNUM 分页 → LIMIT（Knex.js 风格）
  {
    id: 'oracle-rownum-to-limit',
    name: 'ROWNUM 分页转换',
    description: '将 Oracle ROWNUM 分页转换为 DM LIMIT 语法',
    category: 'syntax',
    source: 'oracle',
    pattern: /SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)\s+WHERE\s+ROWNUM\s*<=\s*(\d+)/gi,
    replacement: 'SELECT $1 FROM $2 LIMIT $3',
    examples: [
      {
        before: 'SELECT * FROM (SELECT * FROM users ORDER BY id) WHERE ROWNUM <= 10',
        after: 'SELECT * FROM users ORDER BY id LIMIT 10'
      }
    ]
  },
  // 2. DECODE → CASE WHEN
  {
    id: 'oracle-decode-to-case',
    name: 'DECODE 函数转换',
    description: '将 Oracle DECODE 转换为标准 CASE WHEN',
    category: 'function',
    source: 'oracle',
    pattern: /DECODE\(([^,]+),\s*([^,]+),\s*([^,]+)(?:,\s*([^)]+))?\)/gi,
    replacement: (match) => {
      // 解析 DECODE 参数并转换为 CASE WHEN
      return `CASE ${expr} WHEN ${search} THEN ${result} ELSE ${default} END`;
    },
    examples: [
      {
        before: "DECODE(status, 1, 'active', 0, 'inactive', 'unknown')",
        after: "CASE status WHEN 1 THEN 'active' WHEN 0 THEN 'inactive' ELSE 'unknown' END"
      }
    ]
  },
  // 3. NVL → COALESCE
  {
    id: 'oracle-nvl-to-coalesce',
    name: 'NVL 函数转换',
    description: '将 Oracle NVL 转换为标准 COALESCE',
    category: 'function',
    source: 'oracle',
    pattern: /NVL\(([^,]+),\s*([^)]+)\)/gi,
    replacement: 'COALESCE($1, $2)',
    examples: [
      {
        before: 'NVL(name, \'unknown\')',
        after: "COALESCE(name, 'unknown')"
      }
    ]
  },
  // 4. NVL2 → CASE WHEN
  {
    id: 'oracle-nvl2-to-case',
    name: 'NVL2 函数转换',
    description: '将 Oracle NVL2 转换为标准 CASE WHEN',
    category: 'function',
    source: 'oracle',
    pattern: /NVL2\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
    replacement: 'CASE WHEN $1 IS NOT NULL THEN $2 ELSE $3 END',
    examples: []
  },
  // 5. SYSDATE → CURRENT_TIMESTAMP（DM 兼容 SYSDATE，可选转换）
  {
    id: 'oracle-sysdate',
    name: 'SYSDATE 转换',
    description: '将 Oracle SYSDATE 转换为 DM CURRENT_TIMESTAMP',
    category: 'function',
    source: 'oracle',
    pattern: /\bSYSDATE\b/gi,
    replacement: 'CURRENT_TIMESTAMP',
    examples: []
  },
  // 6. VARCHAR2 → VARCHAR
  {
    id: 'oracle-varchar2-to-varchar',
    name: 'VARCHAR2 类型转换',
    description: '将 Oracle VARCHAR2 转换为 DM VARCHAR',
    category: 'type',
    source: 'oracle',
    pattern: /\bVARCHAR2\b/gi,
    replacement: 'VARCHAR',
    examples: []
  },
  // 7. NUMBER → NUMERIC
  {
    id: 'oracle-number-to-numeric',
    name: 'NUMBER 类型转换',
    description: '将 Oracle NUMBER 转换为 DM NUMERIC',
    category: 'type',
    source: 'oracle',
    pattern: /\bNUMBER\b/gi,
    replacement: 'NUMERIC',
    examples: []
  },
  // 8. 空字符串处理（重要差异）
  {
    id: 'oracle-empty-string',
    name: '空字符串处理',
    description: '标记 Oracle 空字符串处理差异（Oracle: \'\' = NULL, DM: \'\' ≠ NULL）',
    category: 'syntax',
    source: 'oracle',
    pattern: /(?:=\s*''|''\s*=)/g,
    replacement: (match) => {
      return `/* TODO: 空字符串处理差异 - Oracle中''等于NULL，DM中不等于 */ ${match}`;
    },
    examples: []
  }
];

// MySQL → DM 转换规则
export const MYSQL_TO_DM_RULES: ConversionRule[] = [
  // 1. AUTO_INCREMENT → IDENTITY
  {
    id: 'mysql-auto-increment',
    name: 'AUTO_INCREMENT 转换',
    description: '将 MySQL AUTO_INCREMENT 转换为 DM IDENTITY',
    category: 'type',
    source: 'mysql',
    pattern: /\bAUTO_INCREMENT\b/gi,
    replacement: 'IDENTITY(1,1)',
    examples: [
      {
        before: 'CREATE TABLE t (id INT AUTO_INCREMENT, name VARCHAR(50))',
        after: 'CREATE TABLE t (id INT IDENTITY(1,1), name VARCHAR(50))'
      }
    ]
  },
  // 2. IFNULL → COALESCE
  {
    id: 'mysql-ifnull-to-coalesce',
    name: 'IFNULL 函数转换',
    description: '将 MySQL IFNULL 转换为标准 COALESCE',
    category: 'function',
    source: 'mysql',
    pattern: /IFNULL\(([^,]+),\s*([^)]+)\)/gi,
    replacement: 'COALESCE($1, $2)',
    examples: []
  },
  // 3. LIMIT 语法（DM 兼容，无需转换）
  // 4. ENUM → VARCHAR
  {
    id: 'mysql-enum-to-varchar',
    name: 'ENUM 类型转换',
    description: '将 MySQL ENUM 转换为 DM VARCHAR',
    category: 'type',
    source: 'mysql',
    pattern: /ENUM\s*\(([^)]+)\)/gi,
    replacement: 'VARCHAR(255)',
    examples: []
  },
  // 5. JSON → TEXT
  {
    id: 'mysql-json-to-text',
    name: 'JSON 类型转换',
    description: '将 MySQL JSON 转换为 DM TEXT',
    category: 'type',
    source: 'mysql',
    pattern: /\bJSON\b/gi,
    replacement: 'TEXT',
    examples: []
  },
  // 6. TINYINT → SMALLINT
  {
    id: 'mysql-tinyint-to-smallint',
    name: 'TINYINT 类型转换',
    description: '将 MySQL TINYINT 转换为 DM SMALLINT',
    category: 'type',
    source: 'mysql',
    pattern: /\bTINYINT\b/gi,
    replacement: 'SMALLINT',
    examples: []
  }
];
```

### 2.3 Schema 迁移命令 (`dm migrate schema`)

**功能**：迁移表结构、视图、存储过程等数据库对象

```typescript
// src/commands/migrate/schema.ts
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { select, confirm, checkbox } from '@inquirer/prompts';

export function createSchemaCommand(configManager, connectionManager): Command {
  return new Command('schema')
    .description('迁移数据库 Schema')
    .option('-s, --source <type>', '源数据库类型')
    .option('--source-conn <connection>', '源数据库连接字符串')
    .option('--target-conn <name>', '目标数据库连接名')
    .option('--schemas <schemas>', '要迁移的 Schema（逗号分隔）')
    .option('--objects <types>', '要迁移的对象类型 (table|view|procedure|trigger|sequence|all)', 'all')
    .option('--convert-types', '自动转换数据类型', true)
    .option('--convert-syntax', '自动转换 SQL 语法', true)
    .option('--create-schema', '自动创建目标 Schema', false)
    .option('--dry-run', '仅显示 DDL，不执行', false)
    .option('-o, --output <file>', '输出 DDL 文件')
    .action(async (options) => {
      const spinner = ora('正在分析源数据库结构...').start();

      try {
        // 1. 连接源数据库
        // 2. 获取源数据库对象列表
        // 3. 让用户选择要迁移的对象
        // 4. 生成目标 DDL（应用类型映射和语法转换）
        // 5. 执行或输出 DDL

        spinner.succeed('Schema 迁移完成');
      } catch (error) {
        spinner.fail('Schema 迁移失败');
        throw error;
      }
    });
}
```

**数据类型映射**（TypeORM 风格）：

```typescript
// src/lib/migration/type-mapper.ts
interface TypeMapping {
  sourceType: string;
  targetType: string;
  sourceParams?: string;
  targetParams?: string;
  conversion?: string; // 转换表达式
  notes?: string;
}

// Oracle → DM 数据类型映射
export const ORACLE_TO_DM_TYPES: TypeMapping[] = [
  { sourceType: 'NUMBER', targetType: 'NUMERIC' },
  { sourceType: 'NUMBER', targetType: 'INTEGER', sourceParams: '(*,0)' },
  { sourceType: 'NUMBER', targetType: 'BIGINT', sourceParams: '(*,0)', notes: '大整数' },
  { sourceType: 'VARCHAR2', targetType: 'VARCHAR' },
  { sourceType: 'NVARCHAR2', targetType: 'NVARCHAR' },
  { sourceType: 'CHAR', targetType: 'CHAR' },
  { sourceType: 'CLOB', targetType: 'CLOB' },
  { sourceType: 'BLOB', targetType: 'BLOB' },
  { sourceType: 'DATE', targetType: 'DATETIME' },
  { sourceType: 'TIMESTAMP', targetType: 'TIMESTAMP' },
  { sourceType: 'TIMESTAMP WITH TIME ZONE', targetType: 'TIMESTAMP WITH TIME ZONE' },
  { sourceType: 'RAW', targetType: 'VARBINARY' },
  { sourceType: 'ROWID', targetType: 'VARCHAR', targetParams: '18' },
  { sourceType: 'FLOAT', targetType: 'DOUBLE' },
  { sourceType: 'BINARY_FLOAT', targetType: 'FLOAT' },
  { sourceType: 'BINARY_DOUBLE', targetType: 'DOUBLE' },
  { sourceType: 'XMLTYPE', targetType: 'TEXT', notes: 'DM 不原生支持 XMLTYPE' },
  { sourceType: 'SDO_GEOMETRY', targetType: 'TEXT', notes: '空间类型需特殊处理' },
];

// MySQL → DM 数据类型映射
export const MYSQL_TO_DM_TYPES: TypeMapping[] = [
  { sourceType: 'INT', targetType: 'INTEGER' },
  { sourceType: 'INT AUTO_INCREMENT', targetType: 'INTEGER IDENTITY(1,1)' },
  { sourceType: 'BIGINT AUTO_INCREMENT', targetType: 'BIGINT IDENTITY(1,1)' },
  { sourceType: 'TINYINT', targetType: 'SMALLINT' },
  { sourceType: 'MEDIUMINT', targetType: 'INTEGER' },
  { sourceType: 'DOUBLE', targetType: 'DOUBLE' },
  { sourceType: 'FLOAT', targetType: 'FLOAT' },
  { sourceType: 'TEXT', targetType: 'TEXT' },
  { sourceType: 'LONGTEXT', targetType: 'CLOB' },
  { sourceType: 'MEDIUMBLOB', targetType: 'BLOB' },
  { sourceType: 'LONGBLOB', targetType: 'BLOB' },
  { sourceType: 'DATETIME', targetType: 'DATETIME' },
  { sourceType: 'TIMESTAMP', targetType: 'TIMESTAMP' },
  { sourceType: 'ENUM', targetType: 'VARCHAR', targetParams: '255', notes: 'DM 不支持 ENUM' },
  { sourceType: 'SET', targetType: 'VARCHAR', targetParams: '255', notes: 'DM 不支持 SET' },
  { sourceType: 'JSON', targetType: 'TEXT', notes: 'DM 不原生支持 JSON 类型' },
  { sourceType: 'BOOLEAN', targetType: 'BIT', notes: '或使用 TINYINT' },
  { sourceType: 'BIT', targetType: 'BIT' },
];

// 类型映射器
export class TypeMapper {
  private mappings: TypeMapping[];

  constructor(sourceType: DatabaseType, targetType: DatabaseType) {
    this.mappings = this.getMappings(sourceType, targetType);
  }

  mapType(sourceType: string, sourceParams?: string): { type: string; params?: string } {
    // 查找精确匹配
    const exactMatch = this.mappings.find(
      m => m.sourceType === sourceType && m.sourceParams === sourceParams
    );

    if (exactMatch) {
      return {
        type: exactMatch.targetType,
        params: exactMatch.targetParams
      };
    }

    // 查找模糊匹配
    const fuzzyMatch = this.mappings.find(m => m.sourceType === sourceType);

    if (fuzzyMatch) {
      return {
        type: fuzzyMatch.targetType,
        params: fuzzyMatch.targetParams || sourceParams
      };
    }

    // 未知类型，返回原类型并警告
    return { type: sourceType, params: sourceParams };
  }
}
```

### 2.4 数据迁移命令 (`dm migrate data`)

**功能**：迁移表数据，支持批量处理、断点续传

```typescript
// src/commands/migrate/data.ts
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

export function createDataCommand(configManager, connectionManager): Command {
  return new Command('data')
    .description('迁移表数据')
    .option('-s, --source <type>', '源数据库类型')
    .option('--source-conn <connection>', '源数据库连接字符串')
    .option('--target-conn <name>', '目标数据库连接名')
    .option('--tables <tables>', '要迁移的表（逗号分隔）')
    .option('--schemas <schemas>', '要迁移的 Schema（逗号分隔）')
    .option('--batch-size <size>', '批量插入大小', '1000')
    .option('--parallel <n>', '并行迁移表数量', '1')
    .option('--continue-on-error', '遇到错误继续', false)
    .option('--truncate-target', '清空目标表', false)
    .option('--where <condition>', '数据过滤条件')
    .option('--columns <columns>', '要迁移的列（逗号分隔）')
    .option('--progress', '显示进度条', true)
    .action(async (options) => {
      // 实现数据迁移逻辑
    });
}
```

**数据迁移器**（Knex.js 风格的批量处理）：

```typescript
// src/lib/migration/data-migrator.ts
export class DataMigrator {
  private sourceConnector: DatabaseConnector;
  private targetConnector: DatabaseConnector;
  private options: DataMigrationOptions;

  async migrateTable(tableName: string): Promise<MigrationResult> {
    const startTime = Date.now();
    let totalRows = 0;
    let migratedRows = 0;
    let errors: Error[] = [];

    try {
      // 1. 获取源表行数
      totalRows = await this.sourceConnector.getRowCount(tableName);

      // 2. 创建读取流
      const readStream = this.sourceConnector.createReadStream(tableName, {
        batchSize: this.options.batchSize,
        where: this.options.where,
        columns: this.options.columns
      });

      // 3. 批量写入目标
      for await (const batch of readStream) {
        try {
          await this.targetConnector.bulkInsert(tableName, batch, {
            truncate: this.options.truncateTarget && migratedRows === 0
          });
          migratedRows += batch.length;

          // 更新进度
          this.updateProgress(tableName, migratedRows, totalRows);
        } catch (error) {
          if (this.options.continueOnError) {
            errors.push(error);
          } else {
            throw error;
          }
        }
      }

      return {
        tableName,
        totalRows,
        migratedRows,
        errors,
        duration: Date.now() - startTime
      };
    } catch (error) {
      throw new MigrationError(`表 ${tableName} 迁移失败`, error);
    }
  }
}
```

### 2.5 dexp/dimp 封装命令

**功能**：封装达梦官方 dexp/dimp 命令行工具

```typescript
// src/lib/migration/dexp-wrapper.ts
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';

export interface DexpOptions {
  userid: string;          // 用户/密码@主机:端口
  file: string;            // 导出文件名
  log?: string;            // 日志文件
  full?: boolean;          // 全库导出
  schemas?: string[];      // 按模式导出
  tables?: string[];       // 按表导出
  rows?: boolean;          // 是否导出数据行
  compress?: boolean;      // 是否压缩
  owner?: string;          // 按用户导出
}

export class DexpWrapper {
  private dexpPath: string;

  constructor(dexpPath?: string) {
    this.dexpPath = dexpPath || this.findDexpPath();
  }

  /**
   * 执行 dexp 导出
   */
  async export(options: DexpOptions): Promise<void> {
    const args = this.buildArgs(options);

    return new Promise((resolve, reject) => {
      const process = spawn(this.dexpPath, args, { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
        // 解析进度信息
        this.parseProgress(data.toString());
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`dexp 执行失败: ${stderr}`));
        }
      });
    });
  }

  private buildArgs(options: DexpOptions): string[] {
    const args: string[] = [];

    // USERID
    args.push(`USERID=${options.userid}`);

    // FILE
    args.push(`FILE=${options.file}`);

    // LOG
    if (options.log) {
      args.push(`LOG=${options.log}`);
    }

    // 导出模式（互斥）
    if (options.full) {
      args.push('FULL=Y');
    } else if (options.schemas?.length) {
      args.push(`SCHEMAS=${options.schemas.join(',')}`);
    } else if (options.tables?.length) {
      args.push(`TABLES=${options.tables.join(',')}`);
    } else if (options.owner) {
      args.push(`OWNER=${options.owner}`);
    }

    // 其他选项
    if (options.rows === false) {
      args.push('ROWS=N');
    }

    if (options.compress) {
      args.push('COMPRESS=Y');
    }

    return args;
  }
}

// src/lib/migration/dimp-wrapper.ts
export interface DimpOptions {
  userid: string;
  file: string;
  log?: string;
  full?: boolean;
  schemas?: string[];
  tables?: string[];
  rows?: boolean;
  ignore?: boolean;
  tableExistsAction?: 'SKIP' | 'APPEND' | 'TRUNCATE' | 'REPLACE';
  commitRows?: number;
}

export class DimpWrapper {
  private dimpPath: string;

  constructor(dimpPath?: string) {
    this.dimpPath = dimpPath || this.findDimpPath();
  }

  async import(options: DimpOptions): Promise<void> {
    const args = this.buildArgs(options);

    return new Promise((resolve, reject) => {
      const process = spawn(this.dimpPath, args, { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
        this.parseProgress(data.toString());
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`dimp 执行失败: ${stderr}`));
        }
      });
    });
  }

  private buildArgs(options: DimpOptions): string[] {
    const args: string[] = [];

    args.push(`USERID=${options.userid}`);
    args.push(`FILE=${options.file}`);

    if (options.log) {
      args.push(`LOG=${options.log}`);
    }

    if (options.full) {
      args.push('FULL=Y');
    } else if (options.schemas?.length) {
      args.push(`SCHEMAS=${options.schemas.join(',')}`);
    } else if (options.tables?.length) {
      args.push(`TABLES=${options.tables.join(',')}`);
    }

    if (options.rows === false) {
      args.push('ROWS=N');
    }

    if (options.ignore) {
      args.push('IGNORE=Y');
    }

    if (options.tableExistsAction) {
      args.push(`TABLE_EXISTS_ACTION=${options.tableExistsAction}`);
    }

    if (options.commitRows) {
      args.push(`COMMIT_ROWS=${options.commitRows}`);
    }

    return args;
  }
}
```

### 2.6 导入导出命令

```typescript
// src/commands/migrate/export.ts
export function createExportCommand(configManager, connectionManager): Command {
  return new Command('export')
    .description('导出数据库为 dmp 文件')
    .option('-c, --connection <name>', '数据库连接名')
    .option('--full', '全库导出', false)
    .option('--schemas <schemas>', '按 Schema 导出（逗号分隔）')
    .option('--tables <tables>', '按表导出（逗号分隔）')
    .option('-f, --file <file>', '导出文件路径')
    .option('-l, --log <file>', '日志文件路径')
    .option('--no-rows', '只导出结构，不导出数据')
    .option('--compress', '压缩导出文件', false)
    .action(async (options) => {
      const dexp = new DexpWrapper();

      // 构建 USERID
      const connConfig = configManager.getConnection(options.connection);
      const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

      await dexp.export({
        userid,
        file: options.file || `${options.connection}_${new Date().toISOString().slice(0,10)}.dmp`,
        log: options.log,
        full: options.full,
        schemas: options.schemas?.split(','),
        tables: options.tables?.split(','),
        rows: options.rows !== false,
        compress: options.compress
      });
    });
}

// src/commands/migrate/import.ts
export function createImportCommand(configManager, connectionManager): Command {
  return new Command('import')
    .description('从 dmp 文件导入数据库')
    .option('-c, --connection <name>', '数据库连接名')
    .option('-f, --file <file>', '导入文件路径', undefined, true) // required
    .option('--full', '全库导入', false)
    .option('--schemas <schemas>', '按 Schema 导入（逗号分隔）')
    .option('--tables <tables>', '按表导入（逗号分隔）')
    .option('-l, --log <file>', '日志文件路径')
    .option('--no-rows', '只导入结构，不导入数据')
    .option('--ignore', '忽略创建错误', false)
    .option('--table-exists-action <action>', '表已存在时的处理 (skip|append|truncate|replace)', 'append')
    .option('--commit-rows <n>', '每多少行提交一次', '1000')
    .action(async (options) => {
      const dimp = new DimpWrapper();

      const connConfig = configManager.getConnection(options.connection);
      const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

      await dimp.import({
        userid,
        file: options.file,
        log: options.log,
        full: options.full,
        schemas: options.schemas?.split(','),
        tables: options.tables?.split(','),
        rows: options.rows !== false,
        ignore: options.ignore,
        tableExistsAction: options.tableExistsAction.toUpperCase(),
        commitRows: parseInt(options.commitRows)
      });
    });
}
```

### 2.7 结构差异对比命令 (`dm migrate diff`)

```typescript
// src/commands/migrate/diff.ts
export function createDiffCommand(configManager, connectionManager): Command {
  return new Command('diff')
    .description('对比两个数据库的结构差异')
    .option('--source-conn <name>', '源数据库连接名')
    .option('--target-conn <name>', '目标数据库连接名')
    .option('--schemas <schemas>', '要对比的 Schema（逗号分隔）')
    .option('--tables <tables>', '要对比的表（逗号分隔）')
    .option('-f, --format <format>', '输出格式 (text|sql|json)', 'text')
    .option('-o, --output <file>', '输出文件')
    .action(async (options) => {
      // 1. 连接两个数据库
      // 2. 获取两边的结构信息
      // 3. 对比差异
      // 4. 生成差异报告或同步 SQL
    });
}
```

---

## 三、交互式迁移向导（Inquirer.js 最佳实践）

```typescript
// src/lib/migration/wizard.ts
import { input, select, confirm, checkbox, password } from '@inquirer/prompts';

export class MigrationWizard {
  async run(): Promise<MigrationConfig> {
    console.log(chalk.cyan('=== 达梦数据库迁移向导 ===\n'));

    // 1. 选择迁移类型
    const migrationType = await select({
      message: '选择迁移类型:',
      choices: [
        { name: '全量迁移（结构+数据）', value: 'full' },
        { name: '仅迁移结构', value: 'schema' },
        { name: '仅迁移数据', value: 'data' },
        { name: '导出为 dmp 文件', value: 'export' },
        { name: '从 dmp 文件导入', value: 'import' },
        { name: 'SQL 语法转换', value: 'convert' },
        { name: '结构差异对比', value: 'diff' }
      ]
    });

    // 2. 配置源数据库
    const sourceType = await select({
      message: '源数据库类型:',
      choices: [
        { name: 'Oracle', value: 'oracle' },
        { name: 'MySQL', value: 'mysql' },
        { name: 'PostgreSQL', value: 'postgres' },
        { name: 'SQL Server', value: 'sqlserver' },
        { name: '达梦 (DM)', value: 'dm' }
      ]
    });

    const sourceConfig = await this.promptSourceConfig(sourceType);

    // 3. 配置目标数据库
    const targetType = await select({
      message: '目标数据库类型:',
      choices: [
        { name: '达梦 (DM)', value: 'dm' },
        { name: 'Oracle', value: 'oracle' },
        { name: 'MySQL', value: 'mysql' }
      ],
      default: 'dm'
    });

    const targetConfig = await this.promptTargetConfig(targetType);

    // 4. 选择迁移对象
    const objects = await checkbox({
      message: '选择要迁移的对象:',
      choices: [
        { name: '表结构', value: 'tables', checked: true },
        { name: '数据', value: 'data', checked: true },
        { name: '视图', value: 'views' },
        { name: '存储过程/函数', value: 'procedures' },
        { name: '触发器', value: 'triggers' },
        { name: '序列', value: 'sequences' },
        { name: '索引', value: 'indexes', checked: true },
        { name: '约束', value: 'constraints', checked: true }
      ]
    });

    // 5. 高级选项
    const advanced = await confirm({
      message: '是否配置高级选项?',
      default: false
    });

    let advancedOptions = {};
    if (advanced) {
      advancedOptions = await this.promptAdvancedOptions();
    }

    // 6. 确认配置
    console.log(chalk.cyan('\n=== 迁移配置摘要 ==='));
    console.log(JSON.stringify(config, null, 2));

    const confirmed = await confirm({
      message: '确认开始迁移?',
      default: true
    });

    if (!confirmed) {
      throw new Error('用户取消迁移');
    }

    return config;
  }

  private async promptSourceConfig(type: string): Promise<ConnectionConfig> {
    const host = await input({
      message: '主机地址:',
      default: 'localhost'
    });

    const port = await input({
      message: '端口号:',
      default: type === 'oracle' ? '1521' : type === 'mysql' ? '3306' : '5236'
    });

    const user = await input({
      message: '用户名:',
      default: type === 'oracle' ? 'system' : type === 'mysql' ? 'root' : 'SYSDBA'
    });

    const pass = await password({
      message: '密码:',
      mask: '*'
    });

    const database = await input({
      message: '数据库名/SID (可选):'
    });

    return { host, port: parseInt(port), user, password: pass, database };
  }
}
```

---

## 四、进度显示（Ora 最佳实践）

```typescript
// src/lib/migration/progress.ts
import ora, { Ora } from 'ora';
import chalk from 'chalk';

export class MigrationProgress {
  private spinner: Ora;
  private startTime: number;
  private totalItems: number;
  private completedItems: number;

  constructor(message: string) {
    this.spinner = ora(message).start();
    this.startTime = Date.now();
    this.totalItems = 0;
    this.completedItems = 0;
  }

  update(message: string): void {
    this.spinner.text = message;
  }

  increment(): void {
    this.completedItems++;
    const percent = Math.round((this.completedItems / this.totalItems) * 100);
    this.spinner.text = `进度: ${this.completedItems}/${this.totalItems} (${percent}%)`;
  }

  succeed(message?: string): void {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.spinner.succeed(`${message || '完成'} (耗时 ${duration}s)`);
  }

  fail(message?: string): void {
    this.spinner.fail(message || '失败');
  }

  warn(message: string): void {
    this.spinner.warn(message);
  }

  info(message: string): void {
    this.spinner.info(message);
  }
}

// 使用示例
const progress = new MigrationProgress('正在迁移表结构...');

for (const table of tables) {
  progress.update(`正在迁移表: ${table.name}`);
  await migrateTable(table);
  progress.increment();
}

progress.succeed(`成功迁移 ${tables.length} 个表`);
```

---

## 五、错误处理

```typescript
// src/lib/migration/errors.ts
export class MigrationError extends Error {
  code: string;
  details?: any;
  cause?: Error;

  constructor(message: string, options?: { code?: string; details?: any; cause?: Error }) {
    super(message);
    this.name = 'MigrationError';
    this.code = options?.code || 'MIGRATION_ERROR';
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

export const MIGRATION_ERROR_CODES = {
  CONNECTION_FAILED: 'MIGRATION_CONNECTION_FAILED',
  SCHEMA_NOT_FOUND: 'MIGRATION_SCHEMA_NOT_FOUND',
  TABLE_EXISTS: 'MIGRATION_TABLE_EXISTS',
  TYPE_MAPPING_FAILED: 'MIGRATION_TYPE_MAPPING_FAILED',
  SYNTAX_CONVERSION_FAILED: 'MIGRATION_SYNTAX_CONVERSION_FAILED',
  DATA_MIGRATION_FAILED: 'MIGRATION_DATA_MIGRATION_FAILED',
  DEXP_FAILED: 'MIGRATION_DEXP_FAILED',
  DIMP_FAILED: 'MIGRATION_DIMP_FAILED',
  USER_CANCELLED: 'MIGRATION_USER_CANCELLED',
} as const;
```

---

## 六、使用示例

### 6.1 全量迁移（交互式）

```bash
# 启动迁移向导
dm migrate wizard

# 或直接指定参数
dm migrate full \
  --source oracle \
  --source-conn "system/password@192.168.1.100:1521/ORCL" \
  --target-conn local \
  --schemas "HR,SCOTT" \
  --convert-types \
  --convert-syntax \
  --batch-size 5000 \
  --parallel 4
```

### 6.2 SQL 语法转换

```bash
# 转换单个文件
dm migrate convert-sql --from oracle --to dm --input query.sql --output converted.sql

# 批量转换目录
dm migrate convert-sql --from oracle --to dm --input ./sql/oracle/ --output ./sql/dm/

# 就地修改
dm migrate convert-sql --from mysql --to dm --input ./migrations/ --in-place
```

### 6.3 导出导入

```bash
# 导出 Schema
dm migrate export -c production --schemas "HR" --file hr_backup.dmp --log export.log

# 导入 Schema
dm migrate import -c local --file hr_backup.dmp --schemas "HR" --table-exists-action append

# 全库导出
dm migrate export -c production --full --file full_backup.dmp --compress
```

### 6.4 结构差异对比

```bash
# 对比两个环境
dm migrate diff --source-conn production --target-conn staging --schemas "HR"

# 生成同步 SQL
dm migrate diff --source-conn production --target-conn staging --format sql --output sync.sql
```

---

## 七、依赖更新

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3",
    "cosmiconfig": "^9.0.0",
    "js-yaml": "^4.1.0",
    "dmdb": "^1.0.0",
    "@inquirer/prompts": "^5.0.0",
    "csv-parse": "^7.0.0",
    "csv-stringify": "^6.8.0",
    "oracledb": "^6.0.0",      // Oracle 连接（可选）
    "mysql2": "^3.0.0",        // MySQL 连接（可选）
    "pg": "^8.0.0",            // PostgreSQL 连接（可选）
    "mssql": "^10.0.0"         // SQL Server 连接（可选）
  }
}
```

---

## 八、参考资源

- [Commander.js 文档](https://github.com/tj/commander.js)
- [Knex.js 迁移文档](https://github.com/knex/knex)
- [TypeORM 迁移文档](https://github.com/typeorm/typeorm)
- [Inquirer.js 文档](https://github.com/sboudrias/inquirer.js)
- [达梦官方文档](https://eco.dameng.com/document/)
- [达梦技术社区](https://eco.dameng.com/community/)
