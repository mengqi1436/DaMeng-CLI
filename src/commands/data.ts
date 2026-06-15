/**
 * 数据导入导出命令
 *
 * 功能:
 * - data import csv - CSV 导入
 * - data import json - JSON 导入
 * - data import sql - SQL 导入
 * - data export csv - CSV 导出
 * - data export json - JSON 导出
 * - data export sql - SQL 导出
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';

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
 * 获取表列信息
 */
async function getTableColumns(
  connectionManager: ConnectionManager,
  schema: string,
  table: string
): Promise<Array<{ name: string; type: string; nullable: boolean }>> {
  const result = await connectionManager.query(`
    SELECT
      COLUMN_NAME,
      DATA_TYPE,
      NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE OWNER = '${schema.toUpperCase()}'
      AND TABLE_NAME = '${table.toUpperCase()}'
    ORDER BY COLUMN_ID
  `);

  return (result.rows || []).map((row: any) => ({
    name: row.COLUMN_NAME,
    type: row.DATA_TYPE,
    nullable: row.NULLABLE === 'Y',
  }));
}

/**
 * 格式化值为 SQL 字面量
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    return `TO_DATE('${value.toISOString().slice(0, 19).replace('T', ' ')}', 'YYYY-MM-DD HH24:MI:SS')`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 格式化持续时间
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 创建数据导入导出命令
 */
export function dataCommand(
  _configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('data').description('数据导入导出');

  // ============ 导入子命令 ============
  const importCmd = cmd
    .command('import')
    .description('导入数据');

  // CSV 导入
  importCmd
    .command('csv <file>')
    .description('导入 CSV 文件')
    .requiredOption('-t, --table <table>', '目标表')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('-d, --delimiter <char>', '分隔符', ',')
    .option('--header', '首行为表头', true)
    .option('--encoding <encoding>', '文件编码', 'utf-8')
    .option('--batch-size <n>', '批处理大小', '1000')
    .option('--skip-errors', '跳过错误行', false)
    .action(async (file: string, options) => {
      const schema = options.schema || await getCurrentSchema(connectionManager);
      const fullPath = path.resolve(file);

      if (!fs.existsSync(fullPath)) {
        console.error(chalk.red(`文件不存在: ${fullPath}`));
        return;
      }

      const spinner = ora('正在导入...').start();
      const startTime = Date.now();

      try {
        // 读取表结构获取列信息
        const columns = await getTableColumns(connectionManager, schema, options.table);

        // 创建 CSV 解析器（流式处理）
        const parser = fs.createReadStream(fullPath, { encoding: options.encoding })
          .pipe(parse({
            delimiter: options.delimiter,
            columns: options.header,
            skip_empty_lines: true,
            trim: true,
          }));

        let rowCount = 0;
        let errorCount = 0;
        const batch: any[] = [];
        const batchSize = parseInt(options.batchSize, 10);

        // 流式处理每一行
        for await (const record of parser) {
          try {
            batch.push(record);

            if (batch.length >= batchSize) {
              await insertBatch(connectionManager, schema, options.table, columns, batch);
              rowCount += batch.length;
              batch.length = 0;
              spinner.text = `已导入 ${rowCount} 行...`;
            }
          } catch (error: any) {
            errorCount++;
            if (!options.skipErrors) {
              throw error;
            }
            console.error(chalk.yellow(`\n行 ${rowCount + errorCount} 错误: ${error.message}`));
          }
        }

        // 插入剩余数据
        if (batch.length > 0) {
          await insertBatch(connectionManager, schema, options.table, columns, batch);
          rowCount += batch.length;
        }

        const duration = Date.now() - startTime;
        spinner.succeed(chalk.green(`导入完成: ${rowCount} 行 (${formatDuration(duration)})`));
        if (errorCount > 0) {
          console.log(chalk.yellow(`跳过 ${errorCount} 行错误`));
        }
      } catch (error: any) {
        spinner.fail(chalk.red('导入失败'));
        console.error(chalk.red(error.message));
      }
    });

  // JSON 导入
  importCmd
    .command('json <file>')
    .description('导入 JSON 文件')
    .requiredOption('-t, --table <table>', '目标表')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('--array-path <path>', 'JSON 数组路径')
    .action(async (file: string, options) => {
      const schema = options.schema || await getCurrentSchema(connectionManager);
      const fullPath = path.resolve(file);

      const spinner = ora('正在导入...').start();

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        let data = JSON.parse(content);

        // 支持嵌套路径
        if (options.arrayPath) {
          const paths = options.arrayPath.split('.');
          for (const p of paths) {
            data = data[p];
          }
        }

        if (!Array.isArray(data)) {
          throw new Error('JSON 数据必须是数组');
        }

        const columns = await getTableColumns(connectionManager, schema, options.table);
        let rowCount = 0;

        for (const record of data) {
          await insertRow(connectionManager, schema, options.table, columns, record);
          rowCount++;
          spinner.text = `已导入 ${rowCount} 行...`;
        }

        spinner.succeed(chalk.green(`导入完成: ${rowCount} 行`));
      } catch (error: any) {
        spinner.fail(chalk.red('导入失败'));
        console.error(chalk.red(error.message));
      }
    });

  // SQL 导入
  importCmd
    .command('sql <file>')
    .description('导入 SQL 文件')
    .option('--continue-on-error', '遇到错误继续执行', false)
    .option('--dry-run', '仅显示要执行的 SQL', false)
    .action(async (file: string, options) => {
      const fullPath = path.resolve(file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // 分割 SQL 语句
      const statements = content
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('--'));

      const spinner = ora(`正在执行 ${statements.length} 条 SQL...`).start();
      let success = 0;
      let failed = 0;

      for (const sql of statements) {
        try {
          if (options.dryRun) {
            spinner.stop();
            console.log(chalk.gray(`\n${sql};`));
          } else {
            await connectionManager.execute(sql);
          }
          success++;
          spinner.text = `进度: ${success + failed}/${statements.length}`;
        } catch (error: any) {
          failed++;
          spinner.stop();
          console.error(chalk.red(`\nSQL 执行失败: ${error.message}`));
          console.error(chalk.gray(sql));
          if (!options.continueOnError) {
            break;
          }
          spinner.start();
        }
      }

      spinner.stop();
      console.log(chalk.green(`\n执行完成: ${success} 成功, ${failed} 失败`));
    });

  // ============ 导出子命令 ============
  const exportCmd = cmd
    .command('export')
    .description('导出数据');

  // CSV 导出
  exportCmd
    .command('csv <table>')
    .description('导出为 CSV')
    .requiredOption('-o, --output <file>', '输出文件')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('-w, --where <condition>', 'WHERE 条件')
    .option('-c, --columns <columns>', '指定列(逗号分隔)', '*')
    .option('-d, --delimiter <char>', '分隔符', ',')
    .option('--no-header', '不包含表头')
    .action(async (table: string, options) => {
      const schema = options.schema || await getCurrentSchema(connectionManager);
      const outputPath = path.resolve(options.output);

      const spinner = ora('正在导出...').start();

      try {
        let sql = `SELECT ${options.columns} FROM ${schema}.${table}`;
        if (options.where) sql += ` WHERE ${options.where}`;

        const result = await connectionManager.query(sql);
        const rows = result.rows || [];
        const columns = result.metaData?.map((m: any) => m.name) || Object.keys(rows[0] || {});

        // 使用 csv-stringify 流式写入
        const stringifier = stringify({
          header: options.header !== false,
          delimiter: options.delimiter,
        });

        const writeStream = fs.createWriteStream(outputPath);
        stringifier.pipe(writeStream);

        if (options.header !== false) {
          stringifier.write(columns);
        }

        for (const row of rows) {
          stringifier.write(columns.map((col: string) => row[col] ?? ''));
        }

        stringifier.end();

        await new Promise<void>((resolve) => writeStream.on('finish', () => resolve()));

        spinner.succeed(chalk.green(`导出完成: ${rows.length} 行 -> ${outputPath}`));
      } catch (error: any) {
        spinner.fail(chalk.red('导出失败'));
        console.error(chalk.red(error.message));
      }
    });

  // JSON 导出
  exportCmd
    .command('json <table>')
    .description('导出为 JSON')
    .requiredOption('-o, --output <file>', '输出文件')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('-w, --where <condition>', 'WHERE 条件')
    .option('--pretty', '格式化输出', false)
    .action(async (table: string, options) => {
      const schema = options.schema || await getCurrentSchema(connectionManager);

      const spinner = ora('正在导出...').start();

      try {
        let sql = `SELECT * FROM ${schema}.${table}`;
        if (options.where) sql += ` WHERE ${options.where}`;

        const result = await connectionManager.query(sql);
        const rows = result.rows || [];

        const jsonStr = options.pretty
          ? JSON.stringify(rows, null, 2)
          : JSON.stringify(rows);

        fs.writeFileSync(path.resolve(options.output), jsonStr, 'utf-8');

        spinner.succeed(chalk.green(`导出完成: ${rows.length} 行 -> ${options.output}`));
      } catch (error: any) {
        spinner.fail(chalk.red('导出失败'));
        console.error(chalk.red(error.message));
      }
    });

  // SQL 导出 (DDL)
  exportCmd
    .command('sql <table>')
    .description('导出 SQL (DDL)')
    .requiredOption('-o, --output <file>', '输出文件')
    .option('-s, --schema <schema>', '指定 Schema')
    .option('--data', '包含数据', false)
    .action(async (table: string, options) => {
      const schema = options.schema || await getCurrentSchema(connectionManager);

      const spinner = ora('正在导出...').start();

      try {
        // 获取表 DDL
        const ddlResult = await connectionManager.query(
          `SELECT DBMS_METADATA.GET_DDL('TABLE', '${table}', '${schema}') AS DDL FROM DUAL`
        );
        let output = (ddlResult.rows?.[0]?.DDL || '') + ';\n\n';

        // 如果需要数据
        if (options.data) {
          const result = await connectionManager.query(`SELECT * FROM ${schema}.${table}`);
          for (const row of (result.rows || [])) {
            const columns = Object.keys(row);
            const values = columns.map((col) => formatValue(row[col]));
            output += `INSERT INTO ${schema}.${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }

        fs.writeFileSync(path.resolve(options.output), output, 'utf-8');

        spinner.succeed(chalk.green(`导出完成 -> ${options.output}`));
      } catch (error: any) {
        spinner.fail(chalk.red('导出失败'));
        console.error(chalk.red(error.message));
      }
    });

  return cmd;
}

/**
 * 批量插入数据
 */
async function insertBatch(
  connectionManager: ConnectionManager,
  schema: string,
  table: string,
  columns: Array<{ name: string; type: string; nullable: boolean }>,
  rows: any[]
): Promise<void> {
  const columnNames = columns.map((c) => c.name).join(', ');
  const placeholders = columns.map((_, i) => `:${i + 1}`).join(', ');
  const sql = `INSERT INTO ${schema}.${table} (${columnNames}) VALUES (${placeholders})`;

  const bindRows = rows.map((row) =>
    columns.map((col) => row[col.name] ?? null)
  );

  // 使用 executeMany 批量插入
  for (const bindRow of bindRows) {
    await connectionManager.execute(sql, bindRow);
  }
}

/**
 * 插入单行数据
 */
async function insertRow(
  connectionManager: ConnectionManager,
  schema: string,
  table: string,
  columns: Array<{ name: string; type: string; nullable: boolean }>,
  row: any
): Promise<void> {
  const columnNames = columns.map((c) => c.name).join(', ');
  const placeholders = columns.map((_, i) => `:${i + 1}`).join(', ');
  const sql = `INSERT INTO ${schema}.${table} (${columnNames}) VALUES (${placeholders})`;

  const bindValues = columns.map((col) => row[col.name] ?? null);
  await connectionManager.execute(sql, bindValues);
}
