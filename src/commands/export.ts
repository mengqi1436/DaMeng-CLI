/**
 * 导出命令 - 将查询结果导出到文件
 *
 * 功能:
 * - 执行 SQL 查询并将结果导出为文件
 * - 支持 json、csv、tsv 三种导出格式
 * - 自动生成带时间戳的文件名或用户指定输出路径
 * - 可控制是否包含表头、最大行数等
 */

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import { Formatter } from '../lib/formatter';
import type { OutputFormat } from '../lib/formatter';
import { DmcliError, ErrorCode } from '../utils/error';

/** 支持的导出格式 */
const EXPORT_FORMATS: OutputFormat[] = ['json', 'csv', 'tsv'];

/** 格式对应的默认文件扩展名 */
const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  json: '.json',
  csv: '.csv',
  tsv: '.tsv',
  table: '.txt',
};

/**
 * 生成默认导出文件名
 *
 * 格式: dm_export_<日期>_<时间>.<扩展名>
 * 例如: dm_export_20260615_143021.csv
 */
function generateFileName(format: OutputFormat): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const ext = FORMAT_EXTENSIONS[format] || '.txt';
  return `dm_export_${date}_${time}${ext}`;
}

/**
 * 解析导出格式
 *
 * 从用户输入的字符串中解析格式，支持别名映射。
 */
function resolveFormat(value: string): OutputFormat {
  const normalized = value.toLowerCase().trim();
  const aliasMap: Record<string, OutputFormat> = {
    json: 'json',
    csv: 'csv',
    tsv: 'tsv',
    txt: 'tsv',
  };

  const resolved = aliasMap[normalized];
  if (!resolved) {
    throw new DmcliError(
      `不支持的导出格式: "${value}"。支持的格式: ${EXPORT_FORMATS.join(', ')}`,
      ErrorCode.VALIDATION_ERROR
    );
  }
  return resolved;
}

/**
 * 导出数据到文件
 *
 * 核心导出逻辑：将格式化后的内容写入指定文件路径。
 */
function writeToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);

  // 确保输出目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * 创建导出命令
 *
 * 注册 `dm export` 子命令到 Commander 程序。
 *
 * @param configManager - 配置管理器实例
 * @param connectionManager - 连接管理器实例
 * @returns Commander Command 实例
 */
export function exportCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('export')
    .description('将查询结果导出到文件')
    .argument('<sql>', 'SQL 查询语句')
    .option('-f, --format <format>', '导出格式 (json|csv|tsv)', 'csv')
    .option('-o, --output <file>', '输出文件路径（默认自动生成）')
    .option('-n, --max-rows <n>', '最大导出行数', parseInt)
    .option('--no-headers', '不包含列名表头')
    .option('-p, --params <params...>', 'SQL 绑定参数')
    .action(async function (this: Command, sql: string, options: any) {
      // 通过 Commander.js 的 this 上下文获取父命令选项
      const parentOpts = this.parent?.opts() || {};
      const connectionName = parentOpts.connection as string | undefined;
      const verbose = parentOpts.verbose as boolean | undefined;

      const spinner = ora('正在执行查询...').start();
      const startTime = Date.now();

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
              throw new DmcliError(
                '请指定连接 (-c <name>) 或设置默认连接',
                ErrorCode.CONNECTION_NOT_FOUND
              );
            }
          }
        }

        // 解析导出格式
        const format = resolveFormat(options.format);
        const maxRows = options.maxRows || configManager.getCliConfig().maxRows || 10000;
        const showHeaders = options.headers !== false;

        // 执行查询
        const result = await connectionManager.query(sql, options.params);
        const duration = Date.now() - startTime;

        spinner.stop();

        // 检查结果
        if (!result.rows || result.rows.length === 0) {
          console.log(chalk.yellow('查询返回 0 行，未生成导出文件'));
          if (configManager.getCliConfig().showTiming) {
            console.log(chalk.gray(`查询耗时: ${Formatter.formatDuration(duration)}`));
          }
          return;
        }

        // 提取列名
        const columns: string[] =
          result.metaData?.map((m: any) => m.name) ||
          (result.rows.length > 0 ? Object.keys(result.rows[0]) : []);

        // 限制导出行数
        const exportRows = result.rows.slice(0, maxRows);
        const truncated = result.rows.length > maxRows;

        // 格式化数据
        const formatter = new Formatter({
          format,
          maxRows,
          showHeaders,
          color: false,  // 导出文件不使用颜色
        });

        const content = formatter.format({
          columns,
          rows: exportRows,
          totalRows: result.rows.length,
        });

        // 确定输出路径
        const outputPath = path.resolve(options.output || generateFileName(format));

        // 写入文件
        writeToFile(outputPath, content);

        // 输出摘要
        console.log(chalk.green(`导出完成: ${outputPath}`));
        console.log(chalk.gray(`  格式: ${format.toUpperCase()}`));
        console.log(chalk.gray(`  行数: ${exportRows.length}${truncated ? ` (截断自 ${result.rows.length})` : ''}`));
        console.log(chalk.gray(`  列数: ${columns.length}`));
        console.log(chalk.gray(`  大小: ${formatFileSize(Buffer.byteLength(content, 'utf8'))}`));

        if (configManager.getCliConfig().showTiming) {
          console.log(chalk.gray(`  耗时: ${Formatter.formatDuration(duration)}`));
        }

        if (truncated) {
          console.log(chalk.yellow(`\n提示: 结果集超过 ${maxRows} 行，已截断。使用 --max-rows 调整限制。`));
        }
      } catch (error: unknown) {
        spinner.fail(chalk.red('导出失败'));

        if (error instanceof DmcliError) {
          console.error(chalk.red(error.message));
          if (verbose && error.cause) {
            console.error(chalk.gray(error.cause.message));
          }
        } else if (error instanceof Error) {
          console.error(chalk.red(error.message));
          if (verbose && error.stack) {
            console.error(chalk.gray(error.stack));
          }
        } else {
          console.error(chalk.red(String(error)));
        }

        process.exit(1);
      }
    });
}

/**
 * 格式化文件大小
 *
 * 将字节数转换为人类可读的格式。
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
