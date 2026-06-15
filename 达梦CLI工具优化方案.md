# 达梦数据库 CLI 工具优化方案（基于官方文档最佳实践）

## 一、技术栈文档参考

| 技术 | 文档来源 | 关键最佳实践 |
|------|----------|--------------|
| Commander.js | `/tj/commander.js` | 子命令、选项处理、异步 action |
| cosmiconfig | `/cosmiconfig/cosmiconfig` | 自定义搜索位置、YAML 加载器 |
| esbuild | `/evanw/esbuild` | external 模块、shebang banner |
| inquirer.js | `/sboudrias/inquirer.js` | 模块化导入、验证、密码提示 |
| ora | `/sindresorhus/ora` | spinner 状态控制、Promise 集成 |
| cli-table3 | `/cli-table/cli-table3` | 表头样式、列宽、颜色 |

---

## 二、核心代码优化

### 2.1 CLI 入口优化 (src/cli.ts)

**Commander.js 最佳实践**：
- 使用 `.parseAsync()` 支持异步 action
- 使用自定义选项处理函数
- 使用 `.hook()` 进行前置处理

```typescript
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
import { queryCommand } from './commands/query';
import { execCommand } from './commands/exec';
import { exportCommand } from './commands/export';
import { connectionCommand } from './commands/connection';
import { configCommand } from './commands/config';

program.addCommand(connectCommand(configManager, connectionManager));
program.addCommand(queryCommand(configManager, connectionManager));
program.addCommand(execCommand(configManager, connectionManager));
program.addCommand(exportCommand(configManager, connectionManager));
program.addCommand(connectionCommand(configManager));
program.addCommand(configCommand(configManager));

// 使用 parseAsync 支持异步 action（Commander.js 最佳实践）
program.parseAsync(process.argv).catch(async (error) => {
  console.error(chalk.red(error.message));
  if (program.opts().verbose) {
    console.error(chalk.gray(error.stack));
  }
  await connectionManager.closeAll();
  process.exit(1);
});
```

### 2.2 连接命令优化 (src/commands/connect.ts)

**inquirer.js 最佳实践**：
- 使用 `@inquirer/prompts` 模块化导入
- 使用 `password` 提示并设置 `mask`
- 使用 `confirm` 进行确认

```typescript
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
      if (configManager.getConnection(value)) {
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
    default: 'dm',
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
    compatibleMode,
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
```

### 2.3 查询命令优化 (src/commands/query.ts)

**ora 最佳实践**：
- 使用 `ora()` 创建 spinner
- 使用 `.succeed()`、`.fail()` 控制状态
- 使用 `oraPromise` 处理 Promise

**cli-table3 最佳实践**：
- 使用 `head` 定义表头
- 使用 `style` 设置颜色
- 使用 `colWidths` 定义列宽

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora, { oraPromise } from 'ora';
import Table from 'cli-table3';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';

export function queryCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('query')
    .description('执行 SQL 查询')
    .argument('<sql>', 'SQL 查询语句')
    .option('-p, --params <params...>', '查询参数')
    .option('-f, --format <format>', '输出格式 (table|json|csv|tsv)')
    .option('-n, --max-rows <n>', '最大显示行数')
    .option('--no-headers', '不显示列名')
    .action(async (sql: string, options: any) => {
      const parentOpts = program.opts();
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
          const format = options.format || parentOpts.format || 'table';
          const maxRows = options.maxRows || parentOpts.maxRows;

          switch (format) {
            case 'json':
              console.log(JSON.stringify(result.rows, null, 2));
              break;
            case 'csv':
              printCsv(columns, result.rows);
              break;
            case 'tsv':
              printTsv(columns, result.rows);
              break;
            case 'table':
            default:
              printTable(columns, result.rows, maxRows, options.headers);
          }

          console.log(chalk.gray(`\n共 ${result.rows.length} 行`));
        } else {
          console.log(chalk.yellow('查询返回 0 行'));
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
        if (parentOpts.verbose) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });
}

/**
 * 打印表格（cli-table3 最佳实践）
 */
function printTable(
  columns: string[],
  rows: any[],
  maxRows: number,
  showHeaders: boolean
): void {
  // 创建表格实例
  const table = new Table({
    head: showHeaders !== false ? columns.map((col) => chalk.cyan(col)) : [],
    style: {
      head: ['cyan'],    // 表头颜色
      border: ['grey'],  // 边框颜色
    },
    // 自动计算列宽
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

  if (rows.length > maxRows) {
    console.log(chalk.yellow(`... 还有 ${rows.length - maxRows} 行`));
  }
}

/**
 * 打印 CSV 格式
 */
function printCsv(columns: string[], rows: any[]): void {
  // 打印表头
  console.log(columns.join(','));

  // 打印数据行
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // 如果包含逗号、引号或换行，需要用引号包裹
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    console.log(values.join(','));
  }
}

/**
 * 打印 TSV 格式
 */
function printTsv(columns: string[], rows: any[]): void {
  // 打印表头
  console.log(columns.join('\t'));

  // 打印数据行
  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      return String(val).replace(/\t/g, ' ');
    });
    console.log(values.join('\t'));
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
```

### 2.4 配置管理器优化 (src/lib/config-manager.ts)

**cosmiconfig 最佳实践**：
- 使用 `searchPlaces` 自定义搜索位置
- 使用 `loaders` 自定义 YAML 加载器
- 支持同步和异步 API

```typescript
import { cosmiconfig, defaultLoaders } from 'cosmiconfig';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DmcliConfig, ConnectionConfig } from '../types';

const MODULE_NAME = 'dmcli';

export class ConfigManager {
  private config: DmcliConfig;
  private configPath: string;
  private explorer: ReturnType<typeof cosmiconfig>;

  constructor() {
    this.config = this.getDefaultConfig();
    this.configPath = '';

    // cosmiconfig 最佳实践：自定义搜索位置和加载器
    this.explorer = cosmiconfig(MODULE_NAME, {
      // 自定义搜索位置
      searchPlaces: [
        'package.json',
        `.${MODULE_NAME}rc`,
        `.${MODULE_NAME}rc.json`,
        `.${MODULE_NAME}rc.yaml`,
        `.${MODULE_NAME}rc.yml`,
        `.${MODULE_NAME}rc.js`,
        `.${MODULE_NAME}rc.ts`,
        `.${MODULE_NAME}rc.cjs`,
        `${MODULE_NAME}.config.js`,
        `${MODULE_NAME}.config.ts`,
        `${MODULE_NAME}.config.cjs`,
        `.config/${MODULE_NAME}rc`,
        `.config/${MODULE_NAME}rc.json`,
        `.config/${MODULE_NAME}rc.yaml`,
        `.config/${MODULE_NAME}rc.yml`,
      ],
      // 自定义加载器（cosmiconfig 最佳实践）
      loaders: {
        '.yaml': (filepath: string, content: string) => {
          try {
            return yaml.load(content);
          } catch (error: any) {
            error.message = `YAML Error in ${filepath}:\n${error.message}`;
            throw error;
          }
        },
        '.yml': (filepath: string, content: string) => {
          try {
            return yaml.load(content);
          } catch (error: any) {
            error.message = `YAML Error in ${filepath}:\n${error.message}`;
            throw error;
          }
        },
      },
    });
  }

  /**
   * 加载配置
   */
  async load(): Promise<void> {
    // 搜索项目级配置
    const result = await this.explorer.search();

    if (result) {
      this.config = this.mergeConfig(this.getDefaultConfig(), result.config);
      this.configPath = result.filepath;
    }

    // 加载用户级配置
    const userConfigPath = this.getUserConfigPath();
    if (fs.existsSync(userConfigPath)) {
      const userConfig = yaml.load(fs.readFileSync(userConfigPath, 'utf8')) as DmcliConfig;
      this.config = this.mergeConfig(this.config, userConfig);
    }

    // 加载环境变量
    this.loadEnvVars();
  }

  /**
   * 获取用户配置文件路径
   */
  private getUserConfigPath(): string {
    if (process.env.DMCLI_CONFIG) {
      return process.env.DMCLI_CONFIG;
    }

    const homeDir = os.homedir();

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      return path.join(appData, MODULE_NAME, 'config.yaml');
    }

    const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
    return path.join(configHome, MODULE_NAME, 'config.yaml');
  }

  /**
   * 加载环境变量
   */
  private loadEnvVars(): void {
    const envMap: Record<string, string> = {
      DM_HOST: 'defaults.host',
      DM_PORT: 'defaults.port',
      DM_USER: 'defaults.user',
      DM_PASSWORD: 'defaults.password',
      DM_DATABASE: 'defaults.database',
      DM_SCHEMA: 'defaults.schema',
      DM_CHARSET: 'defaults.charset',
      DM_COMPATIBLE_MODE: 'defaults.compatibleMode',
    };

    for (const [envKey, configPath] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        this.setNestedValue(this.config, configPath, value);
      }
    }

    if (typeof this.config.defaults.port === 'string') {
      this.config.defaults.port = parseInt(this.config.defaults.port, 10);
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): DmcliConfig {
    return {
      defaults: {
        host: 'localhost',
        port: 5236,
        user: 'SYSDBA',
        charset: 'UTF-8',
        compatibleMode: 'dm',
      },
      connections: {},
      groups: {},
      cli: {
        defaultConnection: 'local',
        outputFormat: 'table',
        maxRows: 1000,
        showTiming: true,
        confirmDangerous: true,
      },
      pool: {
        maxSize: 10,
        minIdle: 2,
        acquireTimeout: 30000,
      },
    };
  }

  /**
   * 获取连接配置
   */
  getConnection(name: string): ConnectionConfig {
    const extendedConns = this.config.extendedConnections || {};
    if (extendedConns[name]) {
      return this.resolveExtendedConnection(name, extendedConns);
    }

    const conn = this.config.connections[name];
    if (!conn) {
      throw new Error(`连接 "${name}" 不存在。可用连接: ${Object.keys(this.config.connections).join(', ')}`);
    }

    return this.mergeDefaults(conn);
  }

  /**
   * 解析扩展连接
   */
  private resolveExtendedConnection(
    name: string,
    extendedConns: Record<string, ConnectionConfig>
  ): ConnectionConfig {
    const conn = extendedConns[name];
    if (!conn) {
      throw new Error(`扩展连接 "${name}" 不存在`);
    }

    if (conn.extends) {
      const templates = this.config.templates || {};
      const parent = templates[conn.extends];
      if (!parent) {
        throw new Error(`模板 "${conn.extends}" 不存在`);
      }

      const merged = { ...parent, ...conn };
      delete merged.extends;
      return this.mergeDefaults(merged);
    }

    return this.mergeDefaults(conn);
  }

  /**
   * 合并默认值
   */
  private mergeDefaults(conn: Partial<ConnectionConfig>): ConnectionConfig {
    const defaults = this.config.defaults;
    return {
      host: conn.host || defaults.host || 'localhost',
      port: conn.port || defaults.port || 5236,
      user: conn.user || defaults.user || 'SYSDBA',
      password: conn.password || defaults.password || '',
      database: conn.database || defaults.database,
      schema: conn.schema || defaults.schema,
      charset: conn.charset || defaults.charset || 'UTF-8',
      compatibleMode: conn.compatibleMode || defaults.compatibleMode || 'dm',
      connectTimeout: conn.connectTimeout || defaults.connectTimeout || 30000,
      queryTimeout: conn.queryTimeout || defaults.queryTimeout || 60000,
      ...conn,
    };
  }

  /**
   * 列出所有连接
   */
  listConnections(): Array<{ name: string; config: ConnectionConfig }> {
    const result: Array<{ name: string; config: ConnectionConfig }> = [];

    for (const [name, config] of Object.entries(this.config.connections)) {
      result.push({ name, config: this.mergeDefaults(config) });
    }

    const extendedConns = this.config.extendedConnections || {};
    for (const name of Object.keys(extendedConns)) {
      result.push({ name, config: this.getConnection(name) });
    }

    return result;
  }

  /**
   * 获取连接组
   */
  getGroup(name: string): string[] {
    const group = this.config.groups[name];
    if (!group) {
      throw new Error(`连接组 "${name}" 不存在。可用组: ${Object.keys(this.config.groups).join(', ')}`);
    }
    return group;
  }

  /**
   * 列出所有连接组
   */
  listGroups(): Array<{ name: string; connections: string[] }> {
    return Object.entries(this.config.groups).map(([name, connections]) => ({
      name,
      connections,
    }));
  }

  /**
   * 添加连接
   */
  addConnection(name: string, config: ConnectionConfig): void {
    this.config.connections[name] = config;
    this.save();
  }

  /**
   * 删除连接
   */
  removeConnection(name: string): boolean {
    if (this.config.connections[name]) {
      delete this.config.connections[name];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 保存配置
   */
  private save(): void {
    const configPath = this.configPath || this.getUserConfigPath();
    const dir = path.dirname(configPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const yamlStr = yaml.dump(this.config, { indent: 2 });
    fs.writeFileSync(configPath, yamlStr, 'utf8');
  }

  /**
   * 获取 CLI 配置
   */
  getCliConfig() {
    return this.config.cli || {};
  }

  /**
   * 获取连接池配置
   */
  getPoolConfig() {
    return this.config.pool || {};
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(target: DmcliConfig, source: Partial<DmcliConfig>): DmcliConfig {
    return {
      defaults: { ...target.defaults, ...source.defaults },
      connections: { ...target.connections, ...source.connections },
      groups: { ...target.groups, ...source.groups },
      templates: { ...target.templates, ...source.templates },
      extendedConnections: { ...target.extendedConnections, ...source.extendedConnections },
      cli: { ...target.cli, ...source.cli },
      pool: { ...target.pool, ...source.pool },
    };
  }

  /**
   * 设置嵌套值
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }
}
```

### 2.5 打包配置优化 (esbuild.config.mjs)

**esbuild 最佳实践**：
- 使用 `external` 排除原生模块
- 使用 `banner` 添加 shebang
- 使用 `packages: 'external'` 排除所有 npm 包

```javascript
import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  outfile: 'dist/cli.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',           // CJS 格式确保兼容性
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  // esbuild 最佳实践：使用 banner 添加 shebang
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  // esbuild 最佳实践：排除原生模块和 npm 包
  external: [
    // 排除达梦驱动（可能包含原生 addon）
    'dmdb',
    // 排除 macOS 特定模块
    'fsevents',
  ],
  // 如果需要排除所有 npm 包，使用 packages 选项
  // packages: 'external',
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
  // 启用 JSX 支持（如果需要）
  // jsx: 'transform',
  // jsxFactory: 'React.createElement',
  // jsxFragment: 'React.Fragment',
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(buildOptions);
  console.log('Build complete!');
}
```

---

## 三、依赖优化

### 3.1 package.json 优化

```json
{
  "name": "dmcli",
  "version": "1.0.0",
  "description": "达梦数据库命令行工具 - 支持多连接管理",
  "main": "dist/api.js",
  "types": "dist/api.d.ts",
  "bin": {
    "dm": "dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "os": [
    "darwin",
    "linux",
    "win32"
  ],
  "scripts": {
    "build": "node esbuild.config.mjs",
    "build:watch": "node esbuild.config.mjs --watch",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/ --ext .ts",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "keywords": [
    "dameng",
    "database",
    "cli",
    "sql",
    "dm8",
    "dmcli"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3",
    "cosmiconfig": "^9.0.0",
    "js-yaml": "^4.1.0",
    "dmdb": "^1.0.0",
    "@inquirer/prompts": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.0.0",
    "vitest": "^1.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

---

## 四、关键优化点总结

### 4.1 Commander.js 优化

| 优化点 | 实现方式 |
|--------|----------|
| 自定义选项处理 | 使用 `parsePort`、`parseMaxRows` 等函数 |
| 异步 action | 使用 `.parseAsync()` |
| 前置钩子 | 使用 `.hook('preAction', ...)` |
| TypeScript 支持 | 使用 `Command` 类型导入 |

### 4.2 cosmiconfig 优化

| 优化点 | 实现方式 |
|--------|----------|
| 自定义搜索位置 | 使用 `searchPlaces` 数组 |
| YAML 加载器 | 使用自定义 `loaders` |
| 多格式支持 | 支持 `.yaml`、`.yml`、`.json`、`.js`、`.ts` |

### 4.3 esbuild 优化

| 优化点 | 实现方式 |
|--------|----------|
| 排除原生模块 | 使用 `external: ['dmdb', 'fsevents']` |
| shebang banner | 使用 `banner: { js: '#!/usr/bin/env node\n' }` |
| CJS 格式 | 使用 `format: 'cjs'` |
| 代码压缩 | 使用 `minify: true` |

### 4.4 inquirer.js 优化

| 优化点 | 实现方式 |
|--------|----------|
| 模块化导入 | 使用 `@inquirer/prompts` |
| 密码提示 | 使用 `password({ mask: '*' })` |
| 验证 | 使用 `validate` 函数 |
| 选择列表 | 使用 `select` 提示 |

### 4.5 ora 优化

| 优化点 | 实现方式 |
|--------|----------|
| 状态控制 | 使用 `.succeed()`、`.fail()`、`.warn()` |
| Promise 集成 | 使用 `oraPromise()` |
| 自定义颜色 | 使用 `color: 'cyan'` |

### 4.6 cli-table3 优化

| 优化点 | 实现方式 |
|--------|----------|
| 表头样式 | 使用 `style: { head: ['cyan'] }` |
| 边框颜色 | 使用 `style: { border: ['grey'] }` |
| 自动换行 | 使用 `wordWrap: true` |
| 列宽 | 使用 `colWidths` 数组 |

---

## 五、配置文件示例

### 5.1 用户配置文件 (~/.config/dmcli/config.yaml)

```yaml
# 达梦数据库 CLI 配置文件
# 基于 cosmiconfig 最佳实践

# 全局默认值
defaults:
  host: localhost
  port: 5236
  user: SYSDBA
  charset: UTF-8
  compatibleMode: dm

# 连接配置
connections:
  local:
    host: localhost
    password: SYSDBA

  staging:
    host: staging-db.example.com
    user: app_user
    password: "${DM_STAGING_PASSWORD}"

  production:
    host: prod-db.example.com
    user: app_user
    password: "${DM_PROD_PASSWORD}"
    database: PROD_DB
    schema: APP_SCHEMA

# 连接组
groups:
  development:
    - local
  staging:
    - staging
  production:
    - production

# CLI 行为配置
cli:
  defaultConnection: local
  outputFormat: table
  maxRows: 1000
  showTiming: true
  confirmDangerous: true
```

---

*文档生成日期: 2026-06-15*
*基于 Commander.js、cosmiconfig、esbuild、inquirer.js、ora、cli-table3 官方文档最佳实践优化*
