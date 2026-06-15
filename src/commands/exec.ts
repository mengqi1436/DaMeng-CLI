/**
 * 执行命令 - 执行 SQL 语句（INSERT、UPDATE、DELETE、DDL）
 *
 * 功能:
 * - 执行非查询 SQL 语句
 * - 显示影响行数
 * - 自动提交事务
 * - 支持参数化执行
 * - 使用 ora 显示加载状态
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { oraPromise } from 'ora';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';

/**
 * 创建执行命令
 */
export function execCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('exec')
    .description('执行 SQL 语句（INSERT、UPDATE、DELETE、DDL）')
    .argument('<sql>', 'SQL 语句')
    .option('-p, --params <params...>', '执行参数（用于参数化执行）')
    .option('--dry-run', '仅显示 SQL，不实际执行', false)
    .action(async (sql: string, options: any, command: Command) => {
      const parentOpts = command.parent!.opts();

      try {
        // dry-run 模式：仅显示 SQL
        if (options.dryRun) {
          console.log(chalk.cyan('Dry Run - SQL:'));
          console.log(chalk.white(sql));
          if (options.params) {
            console.log(chalk.gray('\n参数:'), options.params);
          }
          return;
        }

        // 确保已连接
        if (!connectionManager.getCurrentConnection()) {
          const connectionName = parentOpts.connection;
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

        // 使用 oraPromise 处理执行（ora 最佳实践）
        const startTime = Date.now();
        const result = await oraPromise(
          connectionManager.execute(sql, options.params),
          {
            text: '执行 SQL...',
            successText: () => {
              const duration = Date.now() - startTime;
              return chalk.green(`执行完成 (${formatDuration(duration)})`);
            },
            failText: '执行失败',
          }
        );

        // 显示影响行数
        const rowsAffected = result.rowsAffected || 0;
        console.log(chalk.cyan('\n执行结果:'));

        // 根据 SQL 类型显示不同的信息
        const sqlType = detectSqlType(sql);
        switch (sqlType) {
          case 'INSERT':
            console.log(chalk.green(`  插入 ${rowsAffected} 行`));
            break;
          case 'UPDATE':
            console.log(chalk.green(`  更新 ${rowsAffected} 行`));
            break;
          case 'DELETE':
            console.log(chalk.green(`  删除 ${rowsAffected} 行`));
            break;
          case 'DDL':
            console.log(chalk.green('  DDL 语句执行成功'));
            break;
          default:
            console.log(chalk.green(`  影响 ${rowsAffected} 行`));
        }

        // 显示自动提交状态
        console.log(chalk.gray('  事务已自动提交'));
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
 * 检测 SQL 类型
 */
function detectSqlType(sql: string): 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER' {
  const normalizedSql = sql.trim().toUpperCase();

  if (normalizedSql.startsWith('INSERT')) {
    return 'INSERT';
  }
  if (normalizedSql.startsWith('UPDATE')) {
    return 'UPDATE';
  }
  if (normalizedSql.startsWith('DELETE')) {
    return 'DELETE';
  }
  if (
    normalizedSql.startsWith('CREATE') ||
    normalizedSql.startsWith('ALTER') ||
    normalizedSql.startsWith('DROP') ||
    normalizedSql.startsWith('TRUNCATE') ||
    normalizedSql.startsWith('GRANT') ||
    normalizedSql.startsWith('REVOKE')
  ) {
    return 'DDL';
  }

  return 'OTHER';
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
