/**
 * 配置管理命令
 *
 * 子命令列表:
 *   config show       - 显示当前配置
 *   config set <key> <value> - 设置配置值
 *   config get <key>  - 获取配置值
 *   config path       - 显示配置文件路径
 *   config edit       - 编辑配置文件
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import fs from 'fs';
import yaml from 'js-yaml';
import { ConfigManager } from '../lib/config-manager';
import type { DmcliConfig } from '../types';

/**
 * 支持通过点号路径设置的配置键映射表
 *
 * 格式: CLI 键名 -> 配置对象中的点号路径
 */
const CONFIG_KEY_MAP: Record<string, string> = {
  // defaults.*
  'defaults.host': 'defaults.host',
  'defaults.port': 'defaults.port',
  'defaults.user': 'defaults.user',
  'defaults.password': 'defaults.password',
  'defaults.database': 'defaults.database',
  'defaults.schema': 'defaults.schema',
  'defaults.charset': 'defaults.charset',
  'defaults.compatibleMode': 'defaults.compatibleMode',
  'defaults.connectTimeout': 'defaults.connectTimeout',
  'defaults.queryTimeout': 'defaults.queryTimeout',
  // cli.*
  'cli.defaultConnection': 'cli.defaultConnection',
  'cli.outputFormat': 'cli.outputFormat',
  'cli.maxRows': 'cli.maxRows',
  'cli.showTiming': 'cli.showTiming',
  'cli.confirmDangerous': 'cli.confirmDangerous',
  'cli.editor': 'cli.editor',
  'cli.historyFile': 'cli.historyFile',
  // pool.*
  'pool.maxSize': 'pool.maxSize',
  'pool.minIdle': 'pool.minIdle',
  'pool.acquireTimeout': 'pool.acquireTimeout',
  'pool.idleTimeout': 'pool.idleTimeout',
  'pool.maxLifetime': 'pool.maxLifetime',
  'pool.validationQuery': 'pool.validationQuery',
  'pool.testOnBorrow': 'pool.testOnBorrow',
  'pool.testWhileIdle': 'pool.testWhileIdle',
};

/**
 * 需要数值类型的配置键
 */
const NUMERIC_KEYS = new Set([
  'defaults.port',
  'defaults.connectTimeout',
  'defaults.queryTimeout',
  'cli.maxRows',
  'pool.maxSize',
  'pool.minIdle',
  'pool.acquireTimeout',
  'pool.idleTimeout',
  'pool.maxLifetime',
]);

/**
 * 需要布尔类型的配置键
 */
const BOOLEAN_KEYS = new Set([
  'cli.showTiming',
  'cli.confirmDangerous',
  'pool.testOnBorrow',
  'pool.testWhileIdle',
]);

/**
 * 创建 config 命令组
 */
export function configCommand(configManager: ConfigManager): Command {
  const cmd = new Command('config').description('管理 CLI 配置');

  // ---- config show ----
  cmd
    .command('show')
    .description('显示当前完整配置')
    .option('-f, --format <format>', '输出格式 (yaml|json)', 'yaml')
    .action((options: { format: string }) => {
      try {
        const config = configManager.getConfig();

        if (options.format === 'json') {
          console.log(JSON.stringify(config, null, 2));
        } else {
          const output = yaml.dump(config, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });
          console.log(output);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`显示配置失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- config set <key> <value> ----
  cmd
    .command('set')
    .description('设置配置值')
    .argument('<key>', '配置键（点号分隔路径，如 defaults.host）')
    .argument('<value>', '配置值')
    .action((key: string, value: string) => {
      try {
        const resolvedPath = resolveConfigKey(key);

        if (!resolvedPath) {
          console.error(chalk.red(`未知的配置键: ${key}`));
          console.log(chalk.gray('\n可用的配置键:'));
          printAvailableKeys();
          process.exit(1);
        }

        // 类型转换
        let convertedValue: unknown = value;
        if (NUMERIC_KEYS.has(resolvedPath)) {
          convertedValue = parseInt(value, 10);
          if (isNaN(convertedValue as number)) {
            console.error(chalk.red(`配置键 "${key}" 需要数值类型的值`));
            process.exit(1);
          }
        } else if (BOOLEAN_KEYS.has(resolvedPath)) {
          convertedValue = parseBoolean(value);
          if (convertedValue === null) {
            console.error(chalk.red(`配置键 "${key}" 需要布尔类型的值 (true/false/yes/no/1/0)`));
            process.exit(1);
          }
        }

        // 通过已有的更新方法写入
        applyConfigValue(configManager, resolvedPath, convertedValue);

        console.log(chalk.green(`已设置 ${key} = ${value}`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`设置配置失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- config get <key> ----
  cmd
    .command('get')
    .description('获取配置值')
    .argument('<key>', '配置键（点号分隔路径，如 defaults.host）')
    .action((key: string) => {
      try {
        const resolvedPath = resolveConfigKey(key);

        if (!resolvedPath) {
          console.error(chalk.red(`未知的配置键: ${key}`));
          console.log(chalk.gray('\n可用的配置键:'));
          printAvailableKeys();
          process.exit(1);
        }

        const config = configManager.getConfig();
        const value = getNestedValue(config, resolvedPath);

        if (value === undefined) {
          console.log(chalk.yellow(`${key} 未设置`));
        } else {
          console.log(value);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`获取配置失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- config path ----
  cmd
    .command('path')
    .description('显示配置文件路径')
    .action(() => {
      try {
        const configPath = configManager.getConfigPath();

        if (configPath) {
          console.log(configPath);
        } else {
          // 显示默认路径
          const defaultPath = getDefaultConfigPath();
          console.log(chalk.gray(`配置文件尚未创建，将保存到: ${defaultPath}`));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`获取配置路径失败: ${message}`));
        process.exit(1);
      }
    });

  // ---- config edit ----
  cmd
    .command('edit')
    .description('在外部编辑器中打开配置文件')
    .action(() => {
      try {
        const configPath = configManager.getConfigPath();

        if (!configPath || !fs.existsSync(configPath)) {
          // 如果配置文件不存在，先创建默认配置
          const defaultPath = configManager.getConfigPath() || getDefaultConfigPath();
          console.log(chalk.yellow(`配置文件不存在，正在创建默认配置...`));
          configManager.save();
          console.log(chalk.green(`已创建配置文件: ${defaultPath}`));
        }

        const targetPath = configPath || getDefaultConfigPath();

        // 使用系统默认编辑器打开
        const editor = process.env.EDITOR || process.env.VISUAL || getDefaultEditor();
        console.log(chalk.gray(`使用编辑器 "${editor}" 打开: ${targetPath}`));

        // 动态导入 child_process 以支持异步
        const { spawn } = require('child_process');
        const child = spawn(editor, [targetPath], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });

        child.on('exit', (code: number | null) => {
          if (code === 0) {
            console.log(chalk.green('配置文件已保存'));
          } else {
            console.log(chalk.yellow(`编辑器退出，退出码: ${code}`));
          }
        });

        child.on('error', (err: Error) => {
          console.error(chalk.red(`无法启动编辑器 "${editor}": ${err.message}`));
          console.log(chalk.gray(`请手动编辑配置文件: ${targetPath}`));
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`编辑配置失败: ${message}`));
        process.exit(1);
      }
    });

  return cmd;
}

// ==================== 辅助函数 ====================

/**
 * 解析配置键
 *
 * 支持简写形式:
 *   host           -> defaults.host
 *   port           -> defaults.port
 *   default        -> cli.defaultConnection
 *   format         -> cli.outputFormat
 *   defaults.host  -> defaults.host (完整路径)
 */
function resolveConfigKey(key: string): string | null {
  // 完整路径直接返回
  if (CONFIG_KEY_MAP[key]) {
    return key;
  }

  // 简写映射
  const shortAliases: Record<string, string> = {
    host: 'defaults.host',
    port: 'defaults.port',
    user: 'defaults.user',
    password: 'defaults.password',
    database: 'defaults.database',
    schema: 'defaults.schema',
    charset: 'defaults.charset',
    default: 'cli.defaultConnection',
    format: 'cli.outputFormat',
    'max-rows': 'cli.maxRows',
    'max-rows': 'cli.maxRows',
    timing: 'cli.showTiming',
    confirm: 'cli.confirmDangerous',
    editor: 'cli.editor',
  };

  const aliasPath = shortAliases[key];
  if (aliasPath && CONFIG_KEY_MAP[aliasPath]) {
    return aliasPath;
  }

  return null;
}

/**
 * 解析布尔值字符串
 */
function parseBoolean(value: string): boolean | null {
  const lower = value.toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(lower)) return true;
  if (['false', 'no', '0', 'off'].includes(lower)) return false;
  return null;
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: Record<string, any>, pathStr: string): unknown {
  const keys = pathStr.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * 将配置值写入 ConfigManager
 *
 * 根据键路径调用对应的更新方法。
 */
function applyConfigValue(configManager: ConfigManager, keyPath: string, value: unknown): void {
  // defaults.* 相关配置
  if (keyPath.startsWith('defaults.')) {
    const config = configManager.getConfig();
    const defaults = { ...config.defaults };
    const field = keyPath.split('.')[1];
    (defaults as any)[field] = value;
    // 通过 save 直接写入文件（ConfigManager 没有 updateDefaults 方法）
    // 需要使用底层的 config 和 save
    (configManager as any).config.defaults = defaults;
    configManager.save();
    return;
  }

  // cli.* 相关配置
  if (keyPath.startsWith('cli.')) {
    const field = keyPath.split('.')[1];
    configManager.updateCliConfig({ [field]: value } as any);
    return;
  }

  // pool.* 相关配置
  if (keyPath.startsWith('pool.')) {
    const field = keyPath.split('.')[1];
    configManager.updatePoolConfig({ [field]: value } as any);
    return;
  }

  throw new Error(`不支持的配置路径: ${keyPath}`);
}

/**
 * 打印所有可用的配置键
 */
function printAvailableKeys(): void {
  const groups: Record<string, string[]> = {
    'defaults (数据库默认值)': [],
    'cli (CLI 行为)': [],
    'pool (连接池)': [],
  };

  for (const key of Object.keys(CONFIG_KEY_MAP)) {
    if (key.startsWith('defaults.')) {
      groups['defaults (数据库默认值)'].push(key);
    } else if (key.startsWith('cli.')) {
      groups['cli (CLI 行为)'].push(key);
    } else if (key.startsWith('pool.')) {
      groups['pool (连接池)'].push(key);
    }
  }

  for (const [group, keys] of Object.entries(groups)) {
    if (keys.length > 0) {
      console.log(chalk.cyan(`  ${group}:`));
      for (const key of keys) {
        console.log(chalk.gray(`    ${key}`));
      }
    }
  }
}

/**
 * 获取默认配置文件路径
 */
function getDefaultConfigPath(): string {
  const homeDir = require('os').homedir();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || require('path').join(homeDir, 'AppData', 'Roaming');
    return require('path').join(appData, 'dmcli', 'config.yaml');
  }

  const configHome = process.env.XDG_CONFIG_HOME || require('path').join(homeDir, '.config');
  return require('path').join(configHome, 'dmcli', 'config.yaml');
}

/**
 * 获取默认编辑器
 */
function getDefaultEditor(): string {
  if (process.platform === 'win32') {
    return 'notepad';
  }
  return 'vi';
}
