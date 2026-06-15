/**
 * 连接管理命令
 *
 * 子命令列表:
 *   connection add <name>       - 添加连接
 *   connection remove <name>    - 删除连接
 *   connection list             - 列出所有连接
 *   connection show <name>      - 显示连接详情
 *   connection test <name>      - 测试连接
 *   connection default <name>   - 设置默认连接
 *   connection export [name]    - 导出连接配置
 *   connection import <file>    - 导入连接配置
 *   connection groups           - 列出连接组
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { input, password, select, confirm } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';
import type { ConnectionConfig } from '../types';

/**
 * 创建 connection 命令组
 */
export function connectionCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('connection').description('管理数据库连接配置').alias('conn');

  // ---- connection add <name> ----
  cmd
    .command('add')
    .description('添加新连接')
    .argument('<name>', '连接别名')
    .option('-i, --interactive', '交互式输入连接参数', false)
    .action(async (name: string, options: { interactive: boolean }) => {
      try {
        if (configManager.hasConnection(name)) {
          console.error(chalk.red(`连接 "${name}" 已存在，请使用其他名称或先删除现有连接`));
          process.exit(1);
        }

        let connConfig: ConnectionConfig;

        if (options.interactive) {
          connConfig = await promptConnectionConfig(name);
        } else {
          // 使用命令行参数或默认值快速创建
          connConfig = await promptConnectionConfig(name);
        }

        configManager.addConnection(name, connConfig);
        console.log(chalk.green(`\n连接 "${name}" 已成功添加`));
      } catch (error: unknown) {
        if (isInquirerCancel(error)) {
          console.log(chalk.yellow('\n已取消'));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`添加连接失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection remove <name> ----
  cmd
    .command('remove')
    .description('删除指定连接')
    .argument('<name>', '连接别名')
    .option('-f, --force', '跳过确认提示', false)
    .action(async (name: string, options: { force: boolean }) => {
      try {
        if (!configManager.hasConnection(name)) {
          console.error(chalk.red(`连接 "${name}" 不存在`));
          process.exit(1);
        }

        if (!options.force) {
          const confirmed = await confirm({
            message: `确认删除连接 "${name}"?`,
            default: false,
          });

          if (!confirmed) {
            console.log(chalk.yellow('已取消'));
            return;
          }
        }

        // 如果当前连接正在使用，先断开
        if (connectionManager.getCurrentName() === name) {
          await connectionManager.disconnect(name);
        }

        configManager.removeConnection(name);
        console.log(chalk.green(`连接 "${name}" 已删除`));
      } catch (error: unknown) {
        if (isInquirerCancel(error)) {
          console.log(chalk.yellow('\n已取消'));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`删除连接失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection list ----
  cmd
    .command('list')
    .description('列出所有已配置的连接')
    .option('--json', '以 JSON 格式输出', false)
    .action((options: { json: boolean }) => {
      try {
        const connections = configManager.listConnections();
        const defaultConn = configManager.getCliConfig().defaultConnection;

        if (connections.length === 0) {
          console.log(chalk.yellow('\n没有配置的连接'));
          console.log(chalk.gray('使用 "dm connection add <name>" 添加连接'));
          return;
        }

        if (options.json) {
          const data = connections.map(({ name, config }) => ({
            name,
            host: config.host,
            port: config.port,
            user: config.user,
            database: config.database || '',
            schema: config.schema || '',
            isDefault: name === defaultConn,
          }));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        console.log(chalk.cyan('\n已配置的连接:\n'));

        const table = new Table({
          head: [
            chalk.cyan('名称'),
            chalk.cyan('主机'),
            chalk.cyan('端口'),
            chalk.cyan('用户'),
            chalk.cyan('数据库'),
            chalk.cyan('Schema'),
            chalk.cyan('默认'),
          ],
          style: { head: ['cyan'], border: ['grey'] },
          wordWrap: true,
        });

        for (const { name, config } of connections) {
          table.push([
            name,
            config.host,
            String(config.port),
            config.user,
            config.database || '-',
            config.schema || '-',
            name === defaultConn ? chalk.green('✓') : '',
          ]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\n共 ${connections.length} 个连接`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`列出连接失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection show <name> ----
  cmd
    .command('show')
    .description('显示连接详情')
    .argument('<name>', '连接别名')
    .action((name: string) => {
      try {
        const config = configManager.getConnection(name);
        const defaultConn = configManager.getCliConfig().defaultConnection;
        const isDefault = name === defaultConn;

        console.log(chalk.cyan(`\n连接 "${name}" 的详细信息:\n`));

        const table = new Table({
          style: { head: ['cyan'], border: ['grey'] },
          wordWrap: true,
        });

        table.push(
          [chalk.gray('名称'), name],
          [chalk.gray('主机'), config.host],
          [chalk.gray('端口'), String(config.port)],
          [chalk.gray('用户'), config.user],
          [chalk.gray('密码'), maskPassword(config.password)],
          [chalk.gray('数据库'), config.database || '-'],
          [chalk.gray('Schema'), config.schema || '-'],
          [chalk.gray('字符集'), config.charset || '-'],
          [chalk.gray('兼容模式'), config.compatibleMode || '-'],
          [chalk.gray('连接超时'), config.connectTimeout ? `${config.connectTimeout}ms` : '-'],
          [chalk.gray('查询超时'), config.queryTimeout ? `${config.queryTimeout}ms` : '-'],
          [chalk.gray('默认连接'), isDefault ? chalk.green('是') : '否']
        );

        if (config.options && Object.keys(config.options).length > 0) {
          table.push([chalk.gray('额外选项'), JSON.stringify(config.options)]);
        }

        console.log(table.toString());
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`显示连接详情失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection test <name> ----
  cmd
    .command('test')
    .description('测试连接是否可用')
    .argument('<name>', '连接别名')
    .action(async (name: string) => {
      const spinner = ora({
        text: `正在测试连接 "${name}"...`,
        color: 'cyan',
      }).start();

      try {
        const startTime = Date.now();
        const success = await connectionManager.test(name);
        const duration = Date.now() - startTime;

        if (success) {
          spinner.succeed(chalk.green(`连接 "${name}" 测试成功 (${duration}ms)`));
        } else {
          spinner.fail(chalk.red(`连接 "${name}" 测试失败`));
          process.exit(1);
        }
      } catch (error: unknown) {
        spinner.fail(chalk.red(`连接 "${name}" 测试失败`));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(message));
        process.exit(1);
      }
    });

  // ---- connection default <name> ----
  cmd
    .command('default')
    .description('设置默认连接')
    .argument('<name>', '连接别名')
    .action((name: string) => {
      try {
        if (!configManager.hasConnection(name)) {
          console.error(chalk.red(`连接 "${name}" 不存在`));
          process.exit(1);
        }

        configManager.updateCliConfig({ defaultConnection: name });
        console.log(chalk.green(`默认连接已设置为 "${name}"`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`设置默认连接失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection export [name] ----
  cmd
    .command('export')
    .description('导出连接配置')
    .argument('[name]', '连接别名（不指定则导出全部）')
    .option('-o, --output <file>', '输出文件路径')
    .option('-f, --format <format>', '输出格式 (yaml|json)', 'yaml')
    .action((name: string | undefined, options: { output?: string; format: string }) => {
      try {
        let exportData: string;
        let exportObj: Record<string, unknown>;

        if (name) {
          // 导出单个连接
          if (!configManager.hasConnection(name)) {
            console.error(chalk.red(`连接 "${name}" 不存在`));
            process.exit(1);
          }
          const config = configManager.getConnection(name);
          exportObj = { name, ...config };
        } else {
          // 导出全部连接
          const connections = configManager.listConnections();
          if (connections.length === 0) {
            console.log(chalk.yellow('没有可导出的连接'));
            return;
          }
          exportObj = {};
          for (const conn of connections) {
            exportObj[conn.name] = conn.config;
          }
        }

        if (options.format === 'json') {
          exportData = JSON.stringify(exportObj, null, 2);
        } else {
          exportData = yaml.dump(exportObj, { indent: 2, lineWidth: 120, noRefs: true });
        }

        if (options.output) {
          const outputPath = path.resolve(options.output);
          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(outputPath, exportData, 'utf8');
          console.log(chalk.green(`连接配置已导出到 ${outputPath}`));
        } else {
          console.log(exportData);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`导出失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection import <file> ----
  cmd
    .command('import')
    .description('从文件导入连接配置')
    .argument('<file>', '配置文件路径 (YAML 或 JSON)')
    .option('--overwrite', '覆盖同名连接', false)
    .action(async (file: string, options: { overwrite: boolean }) => {
      try {
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(chalk.red(`文件不存在: ${filePath}`));
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        let imported: Record<string, ConnectionConfig>;

        if (filePath.endsWith('.json')) {
          imported = JSON.parse(content);
        } else {
          imported = yaml.load(content) as Record<string, ConnectionConfig>;
        }

        if (!imported || typeof imported !== 'object') {
          console.error(chalk.red('无效的配置文件格式'));
          process.exit(1);
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const [name, config] of Object.entries(imported)) {
          if (configManager.hasConnection(name) && !options.overwrite) {
            console.log(chalk.yellow(`跳过已存在的连接 "${name}"（使用 --overwrite 覆盖）`));
            skippedCount++;
            continue;
          }

          configManager.addConnection(name, config);
          importedCount++;
        }

        console.log(chalk.green(`\n导入完成: ${importedCount} 个连接已导入`));
        if (skippedCount > 0) {
          console.log(chalk.yellow(`跳过: ${skippedCount} 个同名连接`));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`导入失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- connection groups ----
  cmd
    .command('groups')
    .description('列出所有连接组')
    .option('--json', '以 JSON 格式输出', false)
    .action((options: { json: boolean }) => {
      try {
        const groups = configManager.listGroups();

        if (groups.length === 0) {
          console.log(chalk.yellow('\n没有配置的连接组'));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(groups, null, 2));
          return;
        }

        console.log(chalk.cyan('\n连接组:\n'));

        const table = new Table({
          head: [chalk.cyan('组名'), chalk.cyan('连接列表')],
          style: { head: ['cyan'], border: ['grey'] },
          wordWrap: true,
        });

        for (const group of groups) {
          table.push([group.name, group.connections.join(', ')]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\n共 ${groups.length} 个连接组`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`列出连接组失败: ${message}`));
        process.exit(1);
      }
    });

  return cmd;
}

// ==================== 辅助函数 ====================

/**
 * 交互式提示用户输入连接配置
 */
async function promptConnectionConfig(name: string): Promise<ConnectionConfig> {
  console.log(chalk.cyan(`\n添加连接 "${name}"\n`));

  const host = await input({
    message: '服务器地址:',
    default: 'localhost',
  });

  const portStr = await input({
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
    message: '数据库名 (可选，直接回车跳过):',
  });

  const schema = await input({
    message: 'Schema 名 (可选，直接回车跳过):',
  });

  const compatibleMode = await select({
    message: '兼容模式:',
    choices: [
      { name: 'DM (默认)', value: 'dm' },
      { name: 'Oracle', value: 'oracle' },
      { name: 'MySQL', value: 'mysql' },
    ],
  });

  return {
    host,
    port: parseInt(portStr, 10),
    user,
    password: pwd,
    database: database || undefined,
    schema: schema || undefined,
    compatibleMode: compatibleMode as 'dm' | 'oracle' | 'mysql',
  };
}

/**
 * 掩码密码，只显示前两位和后两位
 */
function maskPassword(password: string | { source: string } | undefined): string {
  if (!password) return '-';
  if (typeof password !== 'string') return `[${password.source}]`;
  if (password.length <= 4) return '****';
  return `${password.slice(0, 2)}${'*'.repeat(password.length - 4)}${password.slice(-2)}`;
}

/**
 * 判断是否为 inquirer 用户取消操作
 */
function isInquirerCancel(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Cancelled') {
    return true;
  }
  // inquirer 的 cancel 错误可能是 Error 的子类
  if (error && typeof error === 'object' && 'name' in error && (error as any).name === 'ExitPromptError') {
    return true;
  }
  return false;
}
