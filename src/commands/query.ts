/**
 * 查询命令 - 执行 SQL 查询
 *
 * 功能:
 * - 执行 SELECT 查询
 * - 支持参数化查询（绑定变量）
 * - 支持多种输出格式：table、json、csv、tsv
 * - 使用 ora 显示加载状态
 * - 使用 cli-table3 格式化表格输出
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { oraPromise } from 'ora';
import Table from 'cli-table3';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';

/**
 * 输出格式类型
 */
type OutputFormat = 'table' | 'json' | 'csv' | 'tsv';

/**
 * 创建查询命令
 */
export function queryCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('query')
    .description('执行 SQL 查询')
    .argument('<sql>', 'SQL 查询语句')
    .option('-p, --params <params...>', '查询参数（用于参数化查询）')
    .option('-f, --format <format>', '输出格式 (table|json|csv|tsv)')
    .option('-n, --max-rows <n>', '最大显示行数', parseInt)
    .option('--no-headers', '不显示列名（仅 csv/tsv 格式）')
    .action(async (sql: string, options: any, command: Command) => {
      const parentOpts = command.parent!.opts();
      const connectionName = parentOpts.connection;

      try {
        // 确保已连接
        if (!connectionManager.getCurrentConnection()) {
          if (connectionName) {
            await connectionManager.connect(connectionName);
          } else {
            const cliConfig = configManager.getCliConfig();
            if (cliConfig.defaultConnection) {
              await connectionManager.connect(cliConfig.defaultConnection);
            } else {
              throw new Error('请指定连接 (-c <name>) 或设置默认连接');
            }
          }
        }

        // 使用 oraPromise 处理查询（ora 最佳实践）
        const startTime = Date.now();
        const result = await oraPromise(
          connectionManager.query(sql, options.params),
          {
            text: '执行查询...',
            successText: () => {
              const duration = Date.now() - startTime;
              return chalk.green(`查询完成 (${formatDuration(duration)})`);
            },
            failText: '查询失败',
          }
        );

        // 格式化输出
        if (result.rows && result.rows.length > 0) {
          const columns = result.metaData?.map((m: any) => m.name) || Object.keys(result.rows[0]);
          const format: OutputFormat = options.format || parentOpts.format || 'table';
          const maxRows = options.maxRows || parentOpts.maxRows || 1000;
          const showHeaders = options.headers !== false;

          switch (format) {
            case 'json':
              printJson(result.rows);
              break;
            case 'csv':
              printCsv(columns, result.rows, showHeaders);
              break;
            case 'tsv':
              printTsv(columns, result.rows, showHeaders);
              break;
            case 'table':
            default:
              printTable(columns, result.rows, maxRows, showHeaders);
          }

          // 显示行数统计
          console.log(chalk.gray(`\n共 ${result.rows.length} 行`));
          if (result.rows.length > maxRows && format === 'table') {
            console.log(chalk.yellow(`... 还有 ${result.rows.length - maxRows} 行未显示（使用 -n 参数调整）`));
          }
        } else {
          console.log(chalk.yellow('查询返回 0 行'));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
        if (parentOpts.verbose && error instanceof Error) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });
}

/**
 * 打印表格格式（cli-table3 最佳实践）
 */
function printTable(
  columns: string[],
  rows: Record<string, unknown>[],
  maxRows: number,
  showHeaders: boolean
): void {
  // 创建表格实例
  const table = new Table({
    head: showHeaders ? columns.map((col) => chalk.cyan(col)) : [],
    style: {
      head: ['cyan'],    // 表头颜色
      border: ['grey'],  // 边框颜色
    },
    wordWrap: true,
  });

  // 添加数据行
  const displayRows = rows.slice(0, maxRows);
  for (const row of displayRows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) {
        return chalk.gray('NULL');
      }
      return String(val);
    });
    table.push(values);
  }

  console.log(table.toString());
}

/**
 * 打印 JSON 格式
 */
function printJson(rows: Record<string, unknown>[]): void {
  console.log(JSON.stringify(rows, null, 2));
}

/**
 * 打印 CSV 格式
 */
function printCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  showHeaders: boolean
): void {
  // 打印表头
  if (showHeaders) {
    console.log(columns.map((col) => escapeCsvField(col)).join(','));
  }

  // 打印数据行
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      return escapeCsvField(String(val));
    });
    console.log(values.join(','));
  }
}

/**
 * 打印 TSV 格式
 */
function printTsv(
  columns: string[],
  rows: Record<string, unknown>[],
  showHeaders: boolean
): void {
  // 打印表头
  if (showHeaders) {
    console.log(columns.join('\t'));
  }

  // 打印数据行
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      // TSV 中将制表符替换为空格
      return String(val).replace(/\t/g, ' ');
    });
    console.log(values.join('\t'));
  }
}

/**
 * CSV 字段转义
 * 如果字段包含逗号、引号或换行，需要用引号包裹
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * 格式化耗时
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
