/**
 * 表管理命令
 *
 * 功能:
 * - table list - 列出表
 * - table describe <table> - 查看表结构
 * - table create <name> - 创建表（交互式）
 * - table drop <name> - 删除表
 * - table data <table> - 查看表数据
 * - table index - 索引管理
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, select, confirm } from '@inquirer/prompts';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import { executeAndDisplay } from '../lib/formatter';

/**
 * 获取当前 Schema
 */
async function getCurrentSchema(connectionManager: ConnectionManager): Promise<string> {
  const result = await connectionManager.query(
    "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS SCHEMA FROM DUAL"
  );
  return result.rows?.[0]?.SCHEMA || 'SYSDBA';
}

/**
 * 创建表管理命令
 */
export function tableCommand(
  _configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('table').description('表管理');

  // 列出表
  cmd
    .command('list')
    .alias('ls')
    .description('列出表')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('-p, --pattern <pattern>', '名称匹配模式')
    .action(async (options) => {
      try {
        const schema = options.schema || await getCurrentSchema(connectionManager);
        const pattern = options.pattern ? `AND TABLE_NAME LIKE '${options.pattern}'` : '';

        const sql = `
          SELECT
            TABLE_NAME AS "Table Name",
            NUM_ROWS AS "Rows",
            LAST_ANALYZED AS "Last Analyzed",
            TABLESPACE_NAME AS "Tablespace"
          FROM ALL_TABLES
          WHERE OWNER = '${schema.toUpperCase()}'
          ${pattern}
          ORDER BY TABLE_NAME
        `;
        await executeAndDisplay(connectionManager, sql);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 查看表结构
  cmd
    .command('describe <table>')
    .alias('desc')
    .description('查看表结构')
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (table: string, options) => {
      try {
        const schema = options.schema || await getCurrentSchema(connectionManager);

        // 列信息
        console.log(chalk.cyan('\n列信息:'));
        const columnsSql = `
          SELECT
            COLUMN_NAME AS "Column",
            DATA_TYPE AS "Type",
            DATA_LENGTH AS "Length",
            NULLABLE AS "Nullable",
            DATA_DEFAULT AS "Default"
          FROM ALL_TAB_COLUMNS
          WHERE OWNER = '${schema.toUpperCase()}'
            AND TABLE_NAME = '${table.toUpperCase()}'
          ORDER BY COLUMN_ID
        `;
        await executeAndDisplay(connectionManager, columnsSql);

        // 约束信息
        console.log(chalk.cyan('\n约束信息:'));
        const constraintsSql = `
          SELECT
            CONSTRAINT_NAME AS "Constraint",
            CONSTRAINT_TYPE AS "Type",
            SEARCH_CONDITION AS "Condition"
          FROM ALL_CONSTRAINTS
          WHERE OWNER = '${schema.toUpperCase()}'
            AND TABLE_NAME = '${table.toUpperCase()}'
        `;
        await executeAndDisplay(connectionManager, constraintsSql);

        // 索引信息
        console.log(chalk.cyan('\n索引信息:'));
        const indexesSql = `
          SELECT
            INDEX_NAME AS "Index",
            UNIQUENESS AS "Unique",
            COLUMN_NAME AS "Column"
          FROM ALL_IND_COLUMNS
          WHERE TABLE_OWNER = '${schema.toUpperCase()}'
            AND TABLE_NAME = '${table.toUpperCase()}'
          ORDER BY INDEX_NAME, COLUMN_POSITION
        `;
        await executeAndDisplay(connectionManager, indexesSql);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 创建表（交互式）
  cmd
    .command('create <name>')
    .description('创建表')
    .option('-i, --interactive', '交互式创建', false)
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (name: string, options) => {
      if (options.interactive) {
        await interactiveCreateTable(connectionManager, name, options.schema);
      } else {
        console.log(chalk.yellow('请使用 --interactive 选项进行交互式创建'));
        console.log(chalk.gray('或直接使用 SQL: dm query "CREATE TABLE ..."'));
      }
    });

  // 删除表
  cmd
    .command('drop <name>')
    .description('删除表')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('--cascade', '级联删除约束', false)
    .option('--purge', '彻底删除(不放入回收站)', false)
    .option('--force', '跳过确认', false)
    .action(async (name: string, options) => {
      try {
        if (!options.force) {
          const confirmed = await confirm({
            message: `确认删除表 "${name}"?`,
            default: false,
          });
          if (!confirmed) return;
        }

        const schema = options.schema || await getCurrentSchema(connectionManager);
        let sql = `DROP TABLE ${schema}.${name}`;
        if (options.cascade) sql += ' CASCADE CONSTRAINTS';
        if (options.purge) sql += ' PURGE';

        const spinner = ora('删除表...').start();

        try {
          await connectionManager.execute(sql);
          spinner.succeed(chalk.green(`表 "${name}" 已删除`));
        } catch (error: unknown) {
          spinner.fail(chalk.red('删除失败'));
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(message));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 查看表数据
  cmd
    .command('data <table>')
    .description('查看表数据')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('-l, --limit <n>', '限制行数', '100')
    .option('-w, --where <condition>', 'WHERE 条件')
    .option('-o, --order <columns>', '排序列')
    .option('-f, --format <format>', '输出格式', 'table')
    .action(async (table: string, options) => {
      try {
        const schema = options.schema || await getCurrentSchema(connectionManager);
        let sql = `SELECT * FROM ${schema}.${table}`;
        if (options.where) sql += ` WHERE ${options.where}`;
        if (options.order) sql += ` ORDER BY ${options.order}`;
        sql += ` FETCH FIRST ${options.limit} ROWS ONLY`;

        await executeAndDisplay(connectionManager, sql, options.format);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 索引管理子命令
  const indexCmd = cmd
    .command('index')
    .description('索引管理');

  indexCmd
    .command('list <table>')
    .description('列出表的索引')
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (table: string, options) => {
      try {
        const schema = options.schema || await getCurrentSchema(connectionManager);
        const sql = `
          SELECT
            i.INDEX_NAME AS "Index Name",
            i.UNIQUENESS AS "Unique",
            i.INDEX_TYPE AS "Type",
            LISTAGG(ic.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY ic.COLUMN_POSITION) AS "Columns",
            i.STATUS AS "Status"
          FROM ALL_INDEXES i
          JOIN ALL_IND_COLUMNS ic ON i.INDEX_NAME = ic.INDEX_NAME
            AND i.OWNER = ic.INDEX_OWNER
          WHERE i.TABLE_OWNER = '${schema.toUpperCase()}'
            AND i.TABLE_NAME = '${table.toUpperCase()}'
          GROUP BY i.INDEX_NAME, i.UNIQUENESS, i.INDEX_TYPE, i.STATUS
          ORDER BY i.INDEX_NAME
        `;
        await executeAndDisplay(connectionManager, sql);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  indexCmd
    .command('create <table>')
    .description('创建索引')
    .option('-c, --columns <columns>', '索引列(逗号分隔)')
    .option('-u, --unique', '唯一索引', false)
    .option('-n, --name <name>', '索引名称')
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (table: string, options) => {
      try {
        if (!options.columns) {
          console.error(chalk.red('请指定索引列 --columns'));
          return;
        }

        const schema = options.schema || await getCurrentSchema(connectionManager);
        const indexName = options.name || `IDX_${table}_${options.columns.replace(/,/g, '_')}`;
        const unique = options.unique ? 'UNIQUE' : '';

        const sql = `CREATE ${unique} INDEX ${indexName} ON ${schema}.${table} (${options.columns})`;

        const spinner = ora('创建索引...').start();

        try {
          await connectionManager.execute(sql);
          spinner.succeed(chalk.green(`索引 "${indexName}" 创建成功`));
        } catch (error: unknown) {
          spinner.fail(chalk.red('创建失败'));
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(message));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  return cmd;
}

/**
 * 交互式创建表
 */
async function interactiveCreateTable(
  connectionManager: ConnectionManager,
  tableName: string,
  schema?: string
): Promise<void> {
  console.log(chalk.cyan(`\n创建表 ${tableName}\n`));

  const columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue?: string;
  }> = [];

  let addingColumns = true;

  while (addingColumns) {
    const columnName = await input({
      message: '列名 (输入空值结束):',
      validate: (v: string) => !v || /^[A-Za-z_]\w*$/.test(v) || '无效的列名',
    });

    if (!columnName) break;

    const dataType = await select({
      message: '数据类型:',
      choices: [
        { name: 'VARCHAR2(n)', value: 'VARCHAR2' },
        { name: 'NUMBER(p,s)', value: 'NUMBER' },
        { name: 'INTEGER', value: 'INTEGER' },
        { name: 'DATE', value: 'DATE' },
        { name: 'TIMESTAMP', value: 'TIMESTAMP' },
        { name: 'CLOB', value: 'CLOB' },
        { name: 'BLOB', value: 'BLOB' },
        { name: '自定义', value: 'CUSTOM' },
      ],
    });

    let fullType = dataType;
    if (dataType === 'VARCHAR2') {
      const length = await input({ message: '长度:', default: '255' });
      fullType = `VARCHAR2(${length})`;
    } else if (dataType === 'NUMBER') {
      const precision = await input({ message: '精度 (可选):' });
      if (precision) {
        const scale = await input({ message: '小数位数 (默认0):', default: '0' });
        fullType = `NUMBER(${precision},${scale})`;
      }
    } else if (dataType === 'CUSTOM') {
      fullType = await input({ message: '自定义类型:' });
    }

    const nullable = await confirm({ message: '允许为空?', default: true });
    const isPrimaryKey = await confirm({ message: '设为主键?', default: false });

    let defaultValue: string | undefined;
    if (!isPrimaryKey) {
      const useDefault = await confirm({ message: '设置默认值?', default: false });
      if (useDefault) {
        defaultValue = await input({ message: '默认值:' });
      }
    }

    columns.push({
      name: columnName,
      type: fullType,
      nullable,
      primaryKey: isPrimaryKey,
      defaultValue,
    });

    console.log(chalk.green(`列 "${columnName}" 已添加`));
  }

  if (columns.length === 0) {
    console.log(chalk.yellow('未添加任何列，已取消'));
    return;
  }

  // 生成 DDL
  const schemaPrefix = schema ? `${schema}.` : '';
  const columnDefs = columns.map((col) => {
    let def = `  ${col.name} ${col.type}`;
    if (!col.nullable) def += ' NOT NULL';
    if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
    return def;
  });

  const primaryKeys = columns.filter((c) => c.primaryKey).map((c) => c.name);
  if (primaryKeys.length > 0) {
    columnDefs.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
  }

  const ddl = `CREATE TABLE ${schemaPrefix}${tableName} (\n${columnDefs.join(',\n')}\n)`;

  console.log(chalk.cyan('\n生成的 DDL:'));
  console.log(chalk.gray(ddl));

  const confirmed = await confirm({ message: '\n确认创建?', default: true });
  if (confirmed) {
    const spinner = ora('创建表...').start();
    try {
      await connectionManager.execute(ddl);
      spinner.succeed(chalk.green(`表 "${tableName}" 创建成功`));
    } catch (error: unknown) {
      spinner.fail(chalk.red('创建失败'));
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(message));
    }
  }
}
