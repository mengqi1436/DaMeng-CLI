/**
 * 交互式 Shell 命令
 *
 * 功能:
 * - shell - 启动交互式 Shell
 * - shell --connection <name> - 使用指定连接启动 Shell
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import { runInteractiveShell } from '../interactive/shell';

/**
 * 创建 Shell 命令
 */
export function shellCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('shell')
    .description('启动交互式 Shell')
    .option('-c, --connection <name>', '使用指定连接')
    .action(async (options) => {
      try {
        // 如果指定了连接，先建立连接
        if (options.connection) {
          await connectionManager.connect(options.connection);
          console.log(chalk.green(`已连接到 "${options.connection}"`));
        }

        // 启动交互式 Shell
        await runInteractiveShell(connectionManager, configManager);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
        process.exit(1);
      }
    });

  return cmd;
}
