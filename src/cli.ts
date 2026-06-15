#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './lib/config-manager';
import { ConnectionManager } from './lib/connection-manager';

// 自定义选项处理函数（Commander.js 最佳实践）
function parsePort(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue) || parsedValue < 1 || parsedValue > 65535) {
    throw new InvalidArgumentError('端口号必须是 1-65535 之间的数字');
  }
  return parsedValue;
}

function parseMaxRows(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue) || parsedValue < 1) {
    throw new InvalidArgumentError('行数必须是大于 0 的数字');
  }
  return parsedValue;
}

// 初始化管理器
const configManager = new ConfigManager();
const connectionManager = new ConnectionManager(configManager);

const program = new Command();

program
  .name('dm')
  .description(chalk.cyan('达梦数据库命令行工具 - 支持多连接管理'))
  .version('1.0.0', '-v, --version', '显示版本号')
  .option('-c, --connection <name>', '使用指定的连接别名')
  .option('-H, --host <host>', '数据库主机')
  .option('-p, --port <port>', '数据库端口', parsePort)
  .option('-u, --user <user>', '用户名')
  .option('-P, --password <password>', '密码')
  .option('-d, --database <database>', '数据库名')
  .option('-s, --schema <schema>', '默认 Schema')
  .option('--connect-string <dsn>', '连接字符串（优先级高于单独参数）')
  .option('--format <format>', '输出格式 (table|json|csv|tsv)', 'table')
  .option('--max-rows <n>', '最大显示行数', parseMaxRows, 1000)
  .option('--verbose', '详细输出', false)
  .option('--no-color', '禁用颜色输出')
  .hook('preAction', async (thisCommand) => {
    // 在执行任何命令前加载配置
    await configManager.load();
  });

// 注册子命令
import { connectCommand } from './commands/connect';

program.addCommand(connectCommand(configManager, connectionManager));

// 使用 parseAsync 支持异步 action（Commander.js 最佳实践）
program.parseAsync(process.argv).catch(async (error) => {
  console.error(chalk.red(error.message));
  if (program.opts().verbose) {
    console.error(chalk.gray(error.stack));
  }
  await connectionManager.closeAll();
  process.exit(1);
});
