import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, password, select, confirm } from '@inquirer/prompts';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';

export function connectCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('connect')
    .description('连接到数据库')
    .argument('[name]', '连接别名')
    .option('-i, --interactive', '交互式创建连接', false)
    .option('--shell', '进入交互式 Shell', false)
    .action(async (name: string | undefined, options: any) => {
      // 如果没有指定连接名，显示可用连接列表
      if (!name && !options.interactive) {
        showAvailableConnections(configManager);
        return;
      }

      const spinner = ora({
        text: '正在连接...',
        color: 'cyan',
      }).start();

      try {
        if (name) {
          // 使用配置中的连接
          await connectionManager.connect(name);
          spinner.succeed(chalk.green(`已连接到 ${name}`));
        } else if (options.interactive) {
          // 交互式创建连接
          spinner.stop();
          await interactiveConnect(configManager, connectionManager);
        }

        // 显示连接信息
        const config = connectionManager.getCurrentConfig();
        if (config) {
          console.log(chalk.gray(`\n主机: ${config.host}:${config.port}`));
          if (config.database) {
            console.log(chalk.gray(`数据库: ${config.database}`));
          }
          if (config.schema) {
            console.log(chalk.gray(`Schema: ${config.schema}`));
          }
        }

        // 进入交互式 Shell
        if (options.shell) {
          const { runInteractiveShell } = await import('../interactive/shell');
          await runInteractiveShell(connectionManager, configManager);
        }
      } catch (error: any) {
        spinner.fail(chalk.red('连接失败'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });
}

/**
 * 交互式创建连接（inquirer.js 最佳实践）
 */
async function interactiveConnect(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Promise<void> {
  console.log(chalk.cyan('\n创建新连接\n'));

  // 使用 @inquirer/prompts 的 input 提示
  const name = await input({
    message: '连接别名:',
    validate: (value) => {
      if (!value.trim()) {
        return '连接别名不能为空';
      }
      if (configManager.hasConnection(value)) {
        return `连接 "${value}" 已存在`;
      }
      return true;
    },
  });

  const host = await input({
    message: '服务器地址:',
    default: 'localhost',
  });

  const port = await input({
    message: '端口号:',
    default: '5236',
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        return '端口号必须是 1-65535 之间的数字';
      }
      return true;
    },
  });

  const user = await input({
    message: '用户名:',
    default: 'SYSDBA',
  });

  // 使用 password 提示（inquirer.js 最佳实践）
  const pwd = await password({
    message: '密码:',
    mask: '*',
    validate: (value) => {
      if (!value) {
        return '密码不能为空';
      }
      return true;
    },
  });

  const database = await input({
    message: '数据库名 (可选):',
  });

  const schema = await input({
    message: 'Schema 名 (可选):',
  });

  const compatibleMode = await select({
    message: '兼容模式:',
    choices: [
      { name: 'DM (默认)', value: 'dm' },
      { name: 'Oracle', value: 'oracle' },
      { name: 'MySQL', value: 'mysql' },
    ],
  });

  // 确认创建（inquirer.js 最佳实践）
  const confirmed = await confirm({
    message: `确认创建连接 "${name}"?`,
    default: true,
  });

  if (!confirmed) {
    console.log(chalk.yellow('已取消'));
    return;
  }

  // 保存连接配置
  configManager.addConnection(name, {
    host,
    port: parseInt(port, 10),
    user,
    password: pwd,
    database: database || undefined,
    schema: schema || undefined,
    compatibleMode: compatibleMode as 'dm' | 'oracle' | 'mysql',
  });

  console.log(chalk.green(`\n连接 "${name}" 已创建`));

  // 询问是否立即连接
  const connectNow = await confirm({
    message: '是否立即连接?',
    default: true,
  });

  if (connectNow) {
    await connectionManager.connect(name);
    console.log(chalk.green(`已连接到 ${name}`));
  }
}

function showAvailableConnections(configManager: ConfigManager): void {
  const connections = configManager.listConnections();

  if (connections.length === 0) {
    console.log(chalk.yellow('\n没有配置的连接'));
    console.log(chalk.gray('使用 "dm connect -i" 交互式创建连接'));
    console.log(chalk.gray('或使用 "dm connection add <name>" 添加连接'));
    return;
  }

  console.log(chalk.cyan('\n可用连接:\n'));

  for (const { name, config } of connections) {
    const host = `${config.host}:${config.port}`;
    const database = config.database || '';
    const schema = config.schema || '';

    console.log(`  ${chalk.green(name.padEnd(20))} ${chalk.gray(host.padEnd(30))} ${database} ${schema}`);
  }

  console.log(chalk.gray('\n使用 "dm connect <name>" 连接到指定数据库'));
  console.log(chalk.gray('使用 "dm connect -i" 交互式创建新连接'));
}
