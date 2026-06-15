# 达梦数据库 CLI 工具完整实现方案

## 一、项目概述

### 1.1 项目定位

构建一个**支持多数据库连接管理**的达梦数据库命令行工具，通过 `npm install -g dmcli` 全局安装后，用户可使用 `dm` 命令管理多个达梦数据库连接并执行操作。

### 1.2 核心特性

| 特性 | 说明 |
|------|------|
| 多连接管理 | 支持配置和管理多个数据库连接 |
| 连接别名 | 为连接设置简短易记的名称 |
| 连接分组 | 按环境（开发/测试/生产）分组管理 |
| 会话切换 | 交互模式下可切换不同连接 |
| 密码安全 | 支持环境变量、加密存储、密码管理器 |
| 多种输出 | 支持表格、JSON、CSV、TSV 格式 |
| 跨平台 | 支持 Windows、Linux、macOS |

### 1.3 安装使用方式

```bash
# 全局安装
npm install -g dmcli

# 直接连接
dm SYSDBA/SYSDBA@localhost:5236

# 使用连接别名
dm -c production

# 交互模式
dm connect production

# npx 临时使用
npx dmcli query "SELECT 1 FROM DUAL"
```

---

## 二、技术选型

### 2.1 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js >= 18 | npm 生态原生支持 |
| CLI 框架 | Commander.js | 轻量级（~100KB），学习曲线低 |
| 数据库驱动 | dmdb（官方） | 达梦公司维护，API 完整 |
| 打包工具 | esbuild | 极速打包，单文件输出 |
| 类型系统 | TypeScript | 提高代码质量和开发体验 |
| 配置格式 | YAML | 支持注释，层次结构清晰 |
| 配置管理 | cosmiconfig | 自动搜索多种格式配置文件 |

### 2.2 依赖清单

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3",
    "cosmiconfig": "^9.0.0",
    "js-yaml": "^4.1.0",
    "dmdb": "^1.0.0",
    "inquirer": "^9.0.0",
    "conf": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0",
    "@types/inquirer": "^9.0.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 三、项目结构

```
dmcli/
├── src/
│   ├── cli.ts                      # CLI 入口
│   ├── commands/
│   │   ├── connect.ts              # 连接命令
│   │   ├── query.ts                # 查询命令
│   │   ├── exec.ts                 # 执行命令
│   │   ├── export.ts               # 导出命令
│   │   ├── import.ts               # 导入命令
│   │   ├── connection.ts           # 连接管理命令
│   │   └── config.ts               # 配置管理命令
│   ├── lib/
│   │   ├── connection-manager.ts   # 连接管理器
│   │   ├── connection-pool.ts      # 连接池管理
│   │   ├── config-manager.ts       # 配置管理器
│   │   ├── secret-resolver.ts      # 密码解析器
│   │   ├── formatter.ts            # 输出格式化
│   │   └── validator.ts            # 输入验证
│   ├── interactive/
│   │   ├── shell.ts                # 交互式 Shell
│   │   ├── repl.ts                 # REPL 实现
│   │   └── completer.ts            # 自动补全
│   ├── types/
│   │   └── index.ts                # 类型定义
│   └── utils/
│       ├── logger.ts               # 日志工具
│       ├── error.ts                # 错误处理
│       └── platform.ts             # 平台检测
├── bin/
│   └── dm.js                       # 可执行入口
├── dist/                           # 打包输出
├── tests/
│   ├── unit/
│   └── integration/
├── config/
│   └── examples/
│       └── config.example.yaml     # 配置示例
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── publish.yml
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── .npmignore
├── README.md
├── LICENSE
└── CHANGELOG.md
```

---

## 四、配置文件设计

### 4.1 配置文件位置

遵循 XDG Base Directory Specification：

```javascript
// 配置文件搜索路径
const CONFIG_SEARCH_PATHS = [
  // 环境变量指定
  process.env.DMCLI_CONFIG,
  // 项目级配置
  '.dmcli.yml',
  '.dmcli.yaml',
  '.dmcli.json',
  // 用户级配置
  '~/.config/dmcli/config.yaml',      // Linux/macOS
  '%APPDATA%/dmcli/config.yaml',      // Windows
];
```

### 4.2 配置文件格式

```yaml
# ~/.config/dmcli/config.yaml
# 达梦数据库 CLI 配置文件

# ==================== 全局默认值 ====================
defaults:
  host: localhost
  port: 5236
  user: SYSDBA
  charset: UTF-8
  connectTimeout: 30000
  queryTimeout: 60000
  # 兼容模式: dm | oracle | mysql
  compatibleMode: dm

# ==================== 连接配置 ====================
connections:
  # 本地开发（继承 defaults）
  local:
    host: localhost
    password: SYSDBA

  # 本地指定 Schema
  local-app:
    host: localhost
    password: SYSDBA
    schema: MY_APP

  # 测试环境
  staging:
    host: staging-db.example.com
    port: 5236
    user: app_user
    password: "${DM_STAGING_PASSWORD}"    # 从环境变量读取
    database: TEST_DB
    schema: TEST_SCHEMA

  # 生产环境（密码从密钥管理器读取）
  production:
    host: prod-db.example.com
    port: 5236
    user: app_user
    password:
      source: 1password
      vault: Production
      item: dameng-prod
      field: password
    database: PROD_DB
    schema: APP_SCHEMA
    compatibleMode: oracle

  # 从加密存储读取密码
  secure-local:
    host: localhost
    user: SYSDBA
    password: "@keyring:local-dameng"

  # 主库（写）
  prod-primary:
    host: primary-db.example.com
    port: 5236
    user: app_user
    password: "${DM_PROD_PASSWORD}"
    role: primary

  # 从库（读）
  prod-replica:
    host: replica-db.example.com
    port: 5236
    user: readonly_user
    password: "${DM_READONLY_PASSWORD}"
    role: replica

# ==================== 连接分组 ====================
groups:
  development:
    - local
    - local-app
  production:
    - prod-primary
    - prod-replica
  staging:
    - staging

# ==================== 连接模板 ====================
templates:
  base-dev:
    host: localhost
    port: 5236
    charset: UTF-8

  base-remote:
    port: 5236
    charset: UTF-8
    connectTimeout: 60000
    queryTimeout: 120000

# 使用模板的连接（通过 extends 字段）
extended-connections:
  dev-readonly:
    extends: base-dev
    user: readonly_user
    password: "${DM_READONLY_PASSWORD}"

  prod-report:
    extends: base-remote
    host: report-db.example.com
    user: report_user
    password: "@keyring:report-db"

# ==================== CLI 行为配置 ====================
cli:
  # 默认连接（不指定 --connection 时使用）
  defaultConnection: local

  # 输出格式: table | json | csv | tsv
  outputFormat: table

  # 结果集最大行数
  maxRows: 1000

  # 是否显示执行时间
  showTiming: true

  # 是否确认危险操作（DROP, DELETE, TRUNCATE）
  confirmDangerous: true

  # 历史记录文件
  historyFile: ~/.config/dmcli/history

  # 编辑器（用于 :edit 命令）
  editor: code

# ==================== 连接池配置 ====================
pool:
  maxSize: 10
  minIdle: 2
  acquireTimeout: 30000
  idleTimeout: 300000
  maxLifetime: 1800000
  validationQuery: "SELECT 1"
  testOnBorrow: true
  testWhileIdle: true
```

### 4.3 配置优先级

```
命令行参数 > 环境变量 > 项目级配置 > 用户级配置 > 系统默认值
```

### 4.4 环境变量

```bash
# 连接配置
DM_HOST=localhost
DM_PORT=5236
DM_USER=SYSDBA
DM_PASSWORD=secret
DM_DATABASE=DAMENG
DM_SCHEMA=MY_SCHEMA
DM_CHARSET=UTF-8
DM_COMPATIBLE_MODE=oracle

# 密码（连接特定）
DMCLI_PASSWORD_PROD=prod_secret
DMCLI_PASSWORD_STAGING=staging_secret

# 配置文件路径
DMCLI_CONFIG=/path/to/config.yaml

# 调试
DMCLI_DEBUG=true
DMCLI_LOG_LEVEL=info
```

---

## 五、核心代码实现

### 5.1 类型定义 (src/types/index.ts)

```typescript
// 连接配置接口
export interface ConnectionConfig {
  name?: string;
  protocol?: string;
  host: string;
  port: number;
  user: string;
  password: string | PasswordSpec;
  database?: string;
  schema?: string;
  charset?: string;
  compatibleMode?: 'dm' | 'oracle' | 'mysql';
  connectTimeout?: number;
  queryTimeout?: number;
  role?: 'primary' | 'replica';
  extends?: string;
  options?: Record<string, string>;
}

// 密码规范
export interface PasswordSpec {
  source: 'env' | 'file' | 'keyring' | '1password' | 'vault';
  key?: string;
  path?: string;
  alias?: string;
  vault?: string;
  item?: string;
  field?: string;
  mount?: string;
}

// 连接组
export interface ConnectionGroup {
  name: string;
  connections: string[];
  description?: string;
}

// 全局配置
export interface DmcliConfig {
  defaults: Partial<ConnectionConfig>;
  connections: Record<string, ConnectionConfig>;
  groups: Record<string, string[]>;
  templates?: Record<string, Partial<ConnectionConfig>>;
  extendedConnections?: Record<string, ConnectionConfig>;
  cli?: CliConfig;
  pool?: PoolConfig;
}

// CLI 配置
export interface CliConfig {
  defaultConnection?: string;
  outputFormat?: 'table' | 'json' | 'csv' | 'tsv';
  maxRows?: number;
  showTiming?: boolean;
  confirmDangerous?: boolean;
  historyFile?: string;
  editor?: string;
}

// 连接池配置
export interface PoolConfig {
  maxSize?: number;
  minIdle?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  maxLifetime?: number;
  validationQuery?: string;
  testOnBorrow?: boolean;
  testWhileIdle?: boolean;
}

// 查询结果
export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

// 连接状态
export interface ConnectionStatus {
  name: string;
  host: string;
  port: number;
  database?: string;
  schema?: string;
  connected: boolean;
  active: boolean;
}
```

### 5.2 配置管理器 (src/lib/config-manager.ts)

```typescript
import { cosmiconfig } from 'cosmiconfig';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DmcliConfig, ConnectionConfig } from '../types';

const MODULE_NAME = 'dmcli';

export class ConfigManager {
  private config: DmcliConfig;
  private configPath: string;

  constructor() {
    this.config = this.getDefaultConfig();
    this.configPath = '';
  }

  /**
   * 加载配置
   */
  async load(): Promise<void> {
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: [
        `.${MODULE_NAME}rc`,
        `.${MODULE_NAME}rc.yml`,
        `.${MODULE_NAME}rc.yaml`,
        `.${MODULE_NAME}rc.json`,
        `.${MODULE_NAME}rc.js`,
        `${MODULE_NAME}.config.js`,
        `${MODULE_NAME}.config.yaml`,
        `${MODULE_NAME}.config.yml`,
      ],
      loaders: {
        '.yaml': yaml.load,
        '.yml': yaml.load,
      },
    });

    // 搜索项目级配置
    const result = await explorer.search();

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
   * 获取用户配置文件路径
   */
  private getUserConfigPath(): string {
    // 环境变量优先
    if (process.env.DMCLI_CONFIG) {
      return process.env.DMCLI_CONFIG;
    }

    const homeDir = os.homedir();

    // Windows
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      return path.join(appData, MODULE_NAME, 'config.yaml');
    }

    // Linux/macOS
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

    // 端口号转换为数字
    if (typeof this.config.defaults.port === 'string') {
      this.config.defaults.port = parseInt(this.config.defaults.port, 10);
    }
  }

  /**
   * 获取连接配置
   */
  getConnection(name: string): ConnectionConfig {
    // 检查是否是扩展连接
    const extendedConns = this.config.extendedConnections || {};
    if (extendedConns[name]) {
      return this.resolveExtendedConnection(name, extendedConns);
    }

    // 检查普通连接
    const conn = this.config.connections[name];
    if (!conn) {
      throw new Error(`连接 "${name}" 不存在。可用连接: ${Object.keys(this.config.connections).join(', ')}`);
    }

    // 合并默认值
    return this.mergeDefaults(conn);
  }

  /**
   * 解析扩展连接（处理继承）
   */
  private resolveExtendedConnection(
    name: string,
    extendedConns: Record<string, ConnectionConfig>
  ): ConnectionConfig {
    const conn = extendedConns[name];
    if (!conn) {
      throw new Error(`扩展连接 "${name}" 不存在`);
    }

    // 如果有 extends 字段，递归解析
    if (conn.extends) {
      const templates = this.config.templates || {};
      const parent = templates[conn.extends];
      if (!parent) {
        throw new Error(`模板 "${conn.extends}" 不存在`);
      }

      // 合并父模板和当前配置
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

    // 普通连接
    for (const [name, config] of Object.entries(this.config.connections)) {
      result.push({ name, config: this.mergeDefaults(config) });
    }

    // 扩展连接
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

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 保存为 YAML
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

### 5.3 密码解析器 (src/lib/secret-resolver.ts)

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PasswordSpec } from '../types';

export class SecretResolver {
  /**
   * 解析密码
   */
  async resolve(password: string | PasswordSpec): Promise<string> {
    // 如果是对象格式
    if (typeof password === 'object') {
      return this.resolveFromSpec(password);
    }

    // 如果是字符串
    if (typeof password === 'string') {
      // 环境变量引用: ${ENV_VAR}
      const envMatch = password.match(/^\$\{(.+)\}$/);
      if (envMatch) {
        const value = process.env[envMatch[1]];
        if (!value) {
          throw new Error(`环境变量 ${envMatch[1]} 未设置`);
        }
        return value;
      }

      // 密钥环引用: @keyring:alias
      if (password.startsWith('@keyring:')) {
        const alias = password.slice(9);
        return this.resolveFromKeyring(alias);
      }

      // 1Password 引用: @1password:vault/item/field
      if (password.startsWith('@1password:')) {
        const [vault, item, field] = password.slice(11).split('/');
        return this.resolveFrom1Password(vault, item, field);
      }

      // Vault 引用: @vault:mount/path.field
      if (password.startsWith('@vault:')) {
        const spec = password.slice(7);
        const [mountAndPath, field] = spec.split('.');
        const [mount, ...pathParts] = mountAndPath.split('/');
        return this.resolveFromVault(mount, pathParts.join('/'), field);
      }

      // 普通字符串
      return password;
    }

    return '';
  }

  /**
   * 从规范解析密码
   */
  private async resolveFromSpec(spec: PasswordSpec): Promise<string> {
    switch (spec.source) {
      case 'env':
        const value = process.env[spec.key || ''];
        if (!value) {
          throw new Error(`环境变量 ${spec.key} 未设置`);
        }
        return value;

      case 'file':
        if (!spec.path) {
          throw new Error('密码文件路径未指定');
        }
        const filePath = spec.path.replace(/^~/, os.homedir());
        return fs.readFileSync(filePath, 'utf8').trim();

      case 'keyring':
        return this.resolveFromKeyring(spec.alias || '');

      case '1password':
        return this.resolveFrom1Password(
          spec.vault || '',
          spec.item || '',
          spec.field || 'password'
        );

      case 'vault':
        return this.resolveFromVault(
          spec.mount || '',
          spec.path || '',
          spec.field || 'password'
        );

      default:
        throw new Error(`未知的密码来源: ${spec.source}`);
    }
  }

  /**
   * 从系统密钥环读取
   */
  private async resolveFromKeyring(alias: string): Promise<string> {
    // TODO: 实现系统密钥环集成
    // 可以使用 keytar 库
    throw new Error('密钥环功能尚未实现');
  }

  /**
   * 从 1Password CLI 读取
   */
  private async resolveFrom1Password(vault: string, item: string, field: string): Promise<string> {
    const { execSync } = require('child_process');
    try {
      const result = execSync(
        `op item get "${item}" --vault "${vault}" --fields "${field}" --format json`,
        { encoding: 'utf8' }
      );
      return JSON.parse(result).value;
    } catch (error: any) {
      throw new Error(`1Password 读取失败: ${error.message}`);
    }
  }

  /**
   * 从 HashiCorp Vault 读取
   */
  private async resolveFromVault(mount: string, secretPath: string, field: string): Promise<string> {
    const vaultAddr = process.env.VAULT_ADDR;
    const vaultToken = process.env.VAULT_TOKEN;

    if (!vaultAddr || !vaultToken) {
      throw new Error('VAULT_ADDR 和 VAULT_TOKEN 环境变量未设置');
    }

    const response = await fetch(`${vaultAddr}/v1/${mount}/data/${secretPath}`, {
      headers: {
        'X-Vault-Token': vaultToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Vault 请求失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.data[field];
  }

  /**
   * 保存密码到加密存储
   */
  async saveCredential(alias: string, user: string, password: string): Promise<void> {
    // TODO: 实现加密存储
    throw new Error('密码存储功能尚未实现');
  }

  /**
   * 从加密存储读取密码
   */
  async getCredential(alias: string): Promise<{ user: string; password: string } | null> {
    // TODO: 实现加密读取
    throw new Error('密码读取功能尚未实现');
  }
}
```

### 5.4 连接管理器 (src/lib/connection-manager.ts)

```typescript
import dmdb from 'dmdb';
import { ConnectionConfig, ConnectionStatus } from '../types';
import { ConfigManager } from './config-manager';
import { SecretResolver } from './secret-resolver';

export class ConnectionManager {
  private connections: Map<string, {
    config: ConnectionConfig;
    connection: dmdb.Connection;
    active: boolean;
  }>;
  private currentName: string | null;
  private configManager: ConfigManager;
  private secretResolver: SecretResolver;

  constructor(configManager: ConfigManager) {
    this.connections = new Map();
    this.currentName = null;
    this.configManager = configManager;
    this.secretResolver = new SecretResolver();
  }

  /**
   * 连接到数据库
   */
  async connect(name: string): Promise<void> {
    // 检查是否已连接
    const existing = this.connections.get(name);
    if (existing && existing.active) {
      this.currentName = name;
      return;
    }

    // 获取连接配置
    const config = this.configManager.getConnection(name);

    // 解析密码
    const password = await this.secretResolver.resolve(config.password);

    // 构建连接字符串
    const dsn = this.buildDSN({ ...config, password });

    try {
      // 建立连接
      const connection = await dmdb.getConnection({
        connectString: dsn,
        user: config.user,
        password: password,
      });

      // 保存连接
      this.connections.set(name, {
        config,
        connection,
        active: true,
      });

      this.currentName = name;
    } catch (error: any) {
      throw new Error(`连接 "${name}" 失败: ${error.message}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(name?: string): Promise<void> {
    const targetName = name || this.currentName;
    if (!targetName) {
      throw new Error('没有活动的连接');
    }

    const conn = this.connections.get(targetName);
    if (conn) {
      await conn.connection.close();
      this.connections.delete(targetName);

      if (this.currentName === targetName) {
        this.currentName = null;
      }
    }
  }

  /**
   * 切换连接
   */
  async switch(name: string): Promise<void> {
    // 检查是否已连接
    const existing = this.connections.get(name);
    if (existing && existing.active) {
      this.currentName = name;
      return;
    }

    // 尝试连接
    await this.connect(name);
  }

  /**
   * 获取当前连接
   */
  getCurrentConnection(): dmdb.Connection | null {
    if (!this.currentName) {
      return null;
    }

    const conn = this.connections.get(this.currentName);
    return conn ? conn.connection : null;
  }

  /**
   * 获取当前连接名称
   */
  getCurrentName(): string | null {
    return this.currentName;
  }

  /**
   * 获取当前连接配置
   */
  getCurrentConfig(): ConnectionConfig | null {
    if (!this.currentName) {
      return null;
    }

    const conn = this.connections.get(this.currentName);
    return conn ? conn.config : null;
  }

  /**
   * 列出所有连接状态
   */
  listStatus(): ConnectionStatus[] {
    const status: ConnectionStatus[] = [];

    for (const [name, conn] of this.connections) {
      status.push({
        name,
        host: conn.config.host,
        port: conn.config.port,
        database: conn.config.database,
        schema: conn.config.schema,
        connected: conn.active,
        active: name === this.currentName,
      });
    }

    return status;
  }

  /**
   * 测试连接
   */
  async test(name: string): Promise<boolean> {
    try {
      const config = this.configManager.getConnection(name);
      const password = await this.secretResolver.resolve(config.password);
      const dsn = this.buildDSN({ ...config, password });

      const connection = await dmdb.getConnection({
        connectString: dsn,
        user: config.user,
        password: password,
      });

      // 执行简单查询测试
      await connection.execute('SELECT 1 FROM DUAL');
      await connection.close();

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 执行查询
   */
  async query(sql: string, params?: any[]): Promise<any> {
    const conn = this.getCurrentConnection();
    if (!conn) {
      throw new Error('没有活动的连接，请先连接数据库');
    }

    return await conn.execute(sql, params, {
      outFormat: dmdb.OUT_FORMAT_OBJECT,
    });
  }

  /**
   * 执行 SQL（无返回结果）
   */
  async execute(sql: string, params?: any[]): Promise<any> {
    const conn = this.getCurrentConnection();
    if (!conn) {
      throw new Error('没有活动的连接，请先连接数据库');
    }

    return await conn.execute(sql, params, {
      autoCommit: true,
    });
  }

  /**
   * 构建 DSN
   */
  private buildDSN(config: ConnectionConfig): string {
    let dsn = `${config.host}:${config.port}`;

    if (config.database) {
      dsn += `/${config.database}`;
    }

    // 添加查询参数
    const params: string[] = [];
    if (config.charset) {
      params.push(`charset=${config.charset}`);
    }
    if (config.compatibleMode) {
      params.push(`compatibleMode=${config.compatibleMode}`);
    }

    if (params.length > 0) {
      dsn += `?${params.join('&')}`;
    }

    return dsn;
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    for (const [name, conn] of this.connections) {
      try {
        await conn.connection.close();
      } catch {
        // 忽略关闭错误
      }
    }
    this.connections.clear();
    this.currentName = null;
  }
}
```

### 5.5 CLI 入口 (src/cli.ts)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './lib/config-manager';
import { ConnectionManager } from './lib/connection-manager';
import { connectCommand } from './commands/connect';
import { queryCommand } from './commands/query';
import { execCommand } from './commands/exec';
import { exportCommand } from './commands/export';
import { connectionCommand } from './commands/connection';
import { configCommand } from './commands/config';
import { handleError } from './utils/error';

// 初始化管理器
const configManager = new ConfigManager();
const connectionManager = new ConnectionManager(configManager);

const program = new Command();

program
  .name('dm')
  .description(chalk.cyan('达梦数据库命令行工具'))
  .version('1.0.0', '-v, --version', '显示版本号')
  .option('-c, --connection <name>', '使用指定的连接别名')
  .option('-H, --host <host>', '数据库主机')
  .option('-p, --port <port>', '数据库端口')
  .option('-u, --user <user>', '用户名')
  .option('-P, --password <password>', '密码')
  .option('-d, --database <database>', '数据库名')
  .option('-s, --schema <schema>', '默认 Schema')
  .option('--connect-string <dsn>', '连接字符串')
  .option('--format <format>', '输出格式 (table|json|csv|tsv)')
  .option('--verbose', '详细输出', false)
  .hook('preAction', async () => {
    // 加载配置
    await configManager.load();
  });

// 注册子命令
program.addCommand(connectCommand(configManager, connectionManager));
program.addCommand(queryCommand(configManager, connectionManager));
program.addCommand(execCommand(configManager, connectionManager));
program.addCommand(exportCommand(configManager, connectionManager));
program.addCommand(connectionCommand(configManager));
program.addCommand(configCommand(configManager));

// 全局错误处理
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  handleError(error);
  process.exit(1);
} finally {
  await connectionManager.closeAll();
}
```

### 5.6 连接命令 (src/commands/connect.ts)

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';
import { runInteractiveShell } from '../interactive/shell';

export function connectCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('connect')
    .description('连接到数据库')
    .argument('[name]', '连接别名')
    .option('-H, --host <host>', '数据库主机')
    .option('-p, --port <port>', '数据库端口')
    .option('-u, --user <user>', '用户名')
    .option('-P, --password <password>', '密码')
    .option('-d, --database <database>', '数据库名')
    .option('-s, --schema <schema>', '默认 Schema')
    .option('--shell', '进入交互式 Shell', false)
    .action(async (name: string | undefined, options: any) => {
      const spinner = ora('正在连接...').start();

      try {
        // 如果指定了连接名，使用配置中的连接
        if (name) {
          await connectionManager.connect(name);
          spinner.succeed(chalk.green(`已连接到 ${name}`));
        }
        // 否则使用命令行参数
        else if (options.host || options.connectString) {
          // TODO: 临时连接逻辑
          throw new Error('临时连接功能尚未实现');
        }
        // 显示可用连接列表
        else {
          spinner.stop();
          showAvailableConnections(configManager);
          return;
        }

        // 显示连接信息
        const config = connectionManager.getCurrentConfig();
        if (config) {
          console.log(chalk.gray(`主机: ${config.host}:${config.port}`));
          if (config.database) {
            console.log(chalk.gray(`数据库: ${config.database}`));
          }
          if (config.schema) {
            console.log(chalk.gray(`Schema: ${config.schema}`));
          }
        }

        // 进入交互式 Shell
        if (options.shell || !name) {
          await runInteractiveShell(connectionManager, configManager);
        }
      } catch (error: any) {
        spinner.fail(chalk.red('连接失败'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });
}

function showAvailableConnections(configManager: ConfigManager): void {
  const connections = configManager.listConnections();

  if (connections.length === 0) {
    console.log(chalk.yellow('没有配置的连接'));
    console.log(chalk.gray('使用 "dm connection add <name>" 添加连接'));
    return;
  }

  console.log(chalk.cyan('可用连接:'));
  console.log('');

  for (const { name, config } of connections) {
    const host = `${config.host}:${config.port}`;
    const database = config.database || '';
    const schema = config.schema || '';

    console.log(`  ${chalk.green(name.padEnd(20))} ${chalk.gray(host)} ${database} ${schema}`);
  }

  console.log('');
  console.log(chalk.gray('使用 "dm connect <name>" 连接到指定数据库'));
}
```

### 5.7 查询命令 (src/commands/query.ts)

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';
import { formatResult, formatDuration } from '../lib/formatter';

export function queryCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  return new Command('query')
    .description('执行 SQL 查询')
    .argument('<sql>', 'SQL 查询语句')
    .option('-p, --params <params...>', '查询参数')
    .option('-f, --format <format>', '输出格式 (table|json|csv|tsv)')
    .option('-n, --max-rows <n>', '最大显示行数', parseInt)
    .option('--no-headers', '不显示列名')
    .action(async (sql: string, options: any) => {
      // 检查是否有全局连接参数
      const parentOpts = process.argv;
      const connectionName = getOptionValue(parentOpts, '-c') || getOptionValue(parentOpts, '--connection');

      const spinner = ora('执行查询...').start();
      const startTime = Date.now();

      try {
        // 连接到数据库
        if (connectionName) {
          await connectionManager.connect(connectionName);
        } else {
          // 尝试使用默认连接
          const cliConfig = configManager.getCliConfig();
          if (cliConfig.defaultConnection) {
            await connectionManager.connect(cliConfig.defaultConnection);
          } else {
            throw new Error('请指定连接 (-c <name>) 或设置默认连接');
          }
        }

        // 执行查询
        const result = await connectionManager.query(sql, options.params);
        const duration = Date.now() - startTime;

        spinner.stop();

        if (result.rows && result.rows.length > 0) {
          const columns = result.metaData?.map((m: any) => m.name) || Object.keys(result.rows[0]);
          const output = formatResult(columns, result.rows, {
            format: options.format || configManager.getCliConfig().outputFormat || 'table',
            headers: options.headers,
            maxRows: options.maxRows || configManager.getCliConfig().maxRows,
          });

          console.log(output);

          if (configManager.getCliConfig().showTiming) {
            console.log(chalk.gray(`\n执行时间: ${formatDuration(duration)}`));
          }
        } else {
          console.log(chalk.yellow('查询返回 0 行'));

          if (configManager.getCliConfig().showTiming) {
            console.log(chalk.gray(`执行时间: ${formatDuration(duration)}`));
          }
        }
      } catch (error: any) {
        spinner.fail(chalk.red('查询失败'));
        console.error(chalk.red(error.message));

        if (options.verbose) {
          console.error(chalk.gray(error.stack));
        }

        process.exit(1);
      }
    });
}

function getOptionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}
```

### 5.8 连接管理命令 (src/commands/connection.ts)

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionConfig } from '../types';

export function connectionCommand(configManager: ConfigManager): Command {
  const cmd = new Command('connection')
    .alias('conn')
    .description('管理数据库连接');

  // 添加连接
  cmd
    .command('add <name>')
    .description('添加新连接')
    .option('-H, --host <host>', '服务器地址', 'localhost')
    .option('-p, --port <port>', '端口号', '5236')
    .option('-u, --user <user>', '用户名', 'SYSDBA')
    .option('-P, --password <password>', '密码')
    .option('-d, --database <database>', '数据库名')
    .option('-s, --schema <schema>', 'Schema 名')
    .option('--charset <charset>', '字符集', 'UTF-8')
    .option('--compatible-mode <mode>', '兼容模式 (dm|oracle|mysql)', 'dm')
    .option('--interactive', '交互式输入', false)
    .action(async (name: string, options: any) => {
      let config: ConnectionConfig;

      if (options.interactive) {
        // 交互式输入
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'host',
            message: '服务器地址:',
            default: options.host,
          },
          {
            type: 'input',
            name: 'port',
            message: '端口号:',
            default: options.port,
          },
          {
            type: 'input',
            name: 'user',
            message: '用户名:',
            default: options.user,
          },
          {
            type: 'password',
            name: 'password',
            message: '密码:',
            mask: '*',
          },
          {
            type: 'input',
            name: 'database',
            message: '数据库名 (可选):',
          },
          {
            type: 'input',
            name: 'schema',
            message: 'Schema 名 (可选):',
          },
          {
            type: 'list',
            name: 'compatibleMode',
            message: '兼容模式:',
            choices: ['dm', 'oracle', 'mysql'],
            default: options.compatibleMode,
          },
        ]);

        config = {
          host: answers.host,
          port: parseInt(answers.port, 10),
          user: answers.user,
          password: answers.password,
          database: answers.database || undefined,
          schema: answers.schema || undefined,
          charset: options.charset,
          compatibleMode: answers.compatibleMode,
        };
      } else {
        // 使用命令行参数
        if (!options.password) {
          console.error(chalk.red('密码是必需的，请使用 -P 参数指定'));
          process.exit(1);
        }

        config = {
          host: options.host,
          port: parseInt(options.port, 10),
          user: options.user,
          password: options.password,
          database: options.database,
          schema: options.schema,
          charset: options.charset,
          compatibleMode: options.compatibleMode,
        };
      }

      // 保存连接
      configManager.addConnection(name, config);
      console.log(chalk.green(`连接 "${name}" 已添加`));
    });

  // 删除连接
  cmd
    .command('remove <name>')
    .alias('rm')
    .description('删除连接')
    .option('--force', '强制删除', false)
    .action((name: string, options: any) => {
      if (!options.force) {
        // TODO: 确认删除
      }

      if (configManager.removeConnection(name)) {
        console.log(chalk.green(`连接 "${name}" 已删除`));
      } else {
        console.error(chalk.red(`连接 "${name}" 不存在`));
        process.exit(1);
      }
    });

  // 列出连接
  cmd
    .command('list')
    .alias('ls')
    .description('列出所有连接')
    .option('--group <group>', '显示指定组的连接')
    .action((options: any) => {
      if (options.group) {
        // 显示组内连接
        try {
          const connections = configManager.getGroup(options.group);
          console.log(chalk.cyan(`连接组 "${options.group}":`));
          console.log('');
          for (const name of connections) {
            console.log(`  ${chalk.green(name)}`);
          }
        } catch (error: any) {
          console.error(chalk.red(error.message));
          process.exit(1);
        }
      } else {
        // 显示所有连接
        const connections = configManager.listConnections();

        if (connections.length === 0) {
          console.log(chalk.yellow('没有配置的连接'));
          console.log(chalk.gray('使用 "dm connection add <name>" 添加连接'));
          return;
        }

        console.log(chalk.cyan('连接列表:'));
        console.log('');
        console.log(`${'NAME'.padEnd(20)} ${'HOST'.padEnd(30)} ${'USER'.padEnd(15)} ${'DATABASE'.padEnd(15)} ${'SCHEMA'}`);
        console.log('-'.repeat(95));

        for (const { name, config } of connections) {
          console.log(
            `${name.padEnd(20)} ${(config.host + ':' + config.port).padEnd(30)} ${config.user.padEnd(15)} ${(config.database || '').padEnd(15)} ${config.schema || ''}`
          );
        }
      }
    });

  // 显示连接信息
  cmd
    .command('show <name>')
    .description('显示连接详情')
    .action((name: string) => {
      try {
        const config = configManager.getConnection(name);

        console.log(chalk.cyan(`连接 "${name}":`));
        console.log('');
        console.log(`  主机:     ${config.host}:${config.port}`);
        console.log(`  用户:     ${config.user}`);
        console.log(`  数据库:   ${config.database || '(默认)'}`);
        console.log(`  Schema:   ${config.schema || '(默认)'}`);
        console.log(`  字符集:   ${config.charset || 'UTF-8'}`);
        console.log(`  兼容模式: ${config.compatibleMode || 'dm'}`);
      } catch (error: any) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // 测试连接
  cmd
    .command('test <name>')
    .description('测试连接')
    .action(async (name: string) => {
      const spinner = ora(`测试连接 "${name}"...`).start();

      try {
        // TODO: 实现连接测试
        spinner.succeed(chalk.green(`连接 "${name}" 测试成功`));
      } catch (error: any) {
        spinner.fail(chalk.red(`连接 "${name}" 测试失败`));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // 设置默认连接
  cmd
    .command('default <name>')
    .description('设置默认连接')
    .action((name: string) => {
      // TODO: 实现设置默认连接
      console.log(chalk.green(`默认连接已设置为 "${name}"`));
    });

  // 导出连接配置
  cmd
    .command('export [name]')
    .description('导出连接配置')
    .option('-f, --format <format>', '输出格式 (yaml|json)', 'yaml')
    .option('-o, --output <file>', '输出文件')
    .option('--all', '导出所有连接', false)
    .action((name: string | undefined, options: any) => {
      // TODO: 实现导出功能
      console.log(chalk.yellow('导出功能尚未实现'));
    });

  // 导入连接配置
  cmd
    .command('import <file>')
    .description('导入连接配置')
    .option('--overwrite', '覆盖现有连接', false)
    .action((file: string, options: any) => {
      // TODO: 实现导入功能
      console.log(chalk.yellow('导入功能尚未实现'));
    });

  // 列出连接组
  cmd
    .command('groups')
    .description('列出所有连接组')
    .action(() => {
      const groups = configManager.listGroups();

      if (groups.length === 0) {
        console.log(chalk.yellow('没有配置的连接组'));
        return;
      }

      console.log(chalk.cyan('连接组:'));
      console.log('');

      for (const { name, connections } of groups) {
        console.log(`  ${chalk.green(name)}: ${connections.join(', ')}`);
      }
    });

  return cmd;
}
```

### 5.9 交互式 Shell (src/interactive/shell.ts)

```typescript
import readline from 'readline';
import chalk from 'chalk';
import { ConnectionManager } from '../lib/connection-manager';
import { ConfigManager } from '../lib/config-manager';
import { formatResult } from '../lib/formatter';

export async function runInteractiveShell(
  connectionManager: ConnectionManager,
  configManager: ConfigManager
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      // TODO: 实现自动补全
      return [[], line];
    },
  });

  // 显示欢迎信息
  console.log(chalk.cyan('达梦数据库交互式 Shell'));
  console.log(chalk.gray('输入 "help" 查看可用命令，输入 "exit" 退出'));
  console.log('');

  // 获取提示符
  const getPrompt = () => {
    const currentName = connectionManager.getCurrentName();
    if (currentName) {
      return chalk.green(`dm [${currentName}]> `);
    }
    return chalk.green('dm> ');
  };

  // 命令处理
  const handleCommand = async (input: string): Promise<boolean> => {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
      case 'exit':
      case 'quit':
      case '\\q':
        await connectionManager.closeAll();
        console.log(chalk.gray('再见!'));
        return true;

      case 'help':
      case '\\?':
        showHelp();
        return false;

      case 'connect':
      case '\\c':
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: connect <name>'));
          return false;
        }
        try {
          await connectionManager.switch(parts[1]);
          console.log(chalk.green(`已切换到连接 "${parts[1]}"`));
        } catch (error: any) {
          console.error(chalk.red(error.message));
        }
        return false;

      case 'disconnect':
      case '\\d':
        await connectionManager.disconnect();
        console.log(chalk.gray('已断开连接'));
        return false;

      case 'status':
      case '\\s':
        showStatus(connectionManager);
        return false;

      case 'list':
      case '\\l':
        showConnections(configManager);
        return false;

      case 'use':
      case '\\u':
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: use <schema>'));
          return false;
        }
        try {
          await connectionManager.execute(`SET SCHEMA ${parts[1]}`);
          console.log(chalk.green(`已切换到 Schema "${parts[1]}"`));
        } catch (error: any) {
          console.error(chalk.red(error.message));
        }
        return false;

      case 'tables':
      case '\\dt':
        await executeQuery(
          connectionManager,
          "SELECT TABLE_NAME, OWNER FROM ALL_TABLES WHERE OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA') ORDER BY TABLE_NAME"
        );
        return false;

      case 'describe':
      case '\\d+':
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: describe <table>'));
          return false;
        }
        await executeQuery(
          connectionManager,
          `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = '${parts[1].toUpperCase()}' ORDER BY COLUMN_ID`
        );
        return false;

      default:
        // 执行 SQL
        await executeQuery(connectionManager, input);
        return false;
    }
  };

  // 执行查询
  const executeQuery = async (connManager: ConnectionManager, sql: string): Promise<void> => {
    try {
      const result = await connManager.query(sql);
      if (result.rows && result.rows.length > 0) {
        const columns = result.metaData?.map((m: any) => m.name) || Object.keys(result.rows[0]);
        const output = formatResult(columns, result.rows, {
          format: configManager.getCliConfig().outputFormat || 'table',
        });
        console.log(output);
      } else if (result.rowsAffected !== undefined) {
        console.log(chalk.green(`影响 ${result.rowsAffected} 行`));
      }
    } catch (error: any) {
      console.error(chalk.red(error.message));
    }
  };

  // 显示帮助
  const showHelp = (): void => {
    console.log(chalk.cyan('可用命令:'));
    console.log('');
    console.log('  connect <name>    连接到数据库 (\\c)');
    console.log('  disconnect        断开连接 (\\d)');
    console.log('  status            显示当前连接状态 (\\s)');
    console.log('  list              列出所有连接 (\\l)');
    console.log('  use <schema>      切换 Schema (\\u)');
    console.log('  tables            显示所有表 (\\dt)');
    console.log('  describe <table>  显示表结构 (\\d+)');
    console.log('  help              显示此帮助 (\\?)');
    console.log('  exit              退出 (\\q)');
    console.log('');
    console.log('  直接输入 SQL 语句执行查询');
  };

  // 显示状态
  const showStatus = (connManager: ConnectionManager): void => {
    const currentName = connManager.getCurrentName();
    const currentConfig = connManager.getCurrentConfig();

    if (currentName && currentConfig) {
      console.log(chalk.cyan('当前连接:'));
      console.log(`  名称:   ${currentName}`);
      console.log(`  主机:   ${currentConfig.host}:${currentConfig.port}`);
      console.log(`  用户:   ${currentConfig.user}`);
      if (currentConfig.database) {
        console.log(`  数据库: ${currentConfig.database}`);
      }
      if (currentConfig.schema) {
        console.log(`  Schema: ${currentConfig.schema}`);
      }
    } else {
      console.log(chalk.yellow('没有活动的连接'));
    }
  };

  // 显示连接列表
  const showConnections = (configMgr: ConfigManager): void => {
    const connections = configMgr.listConnections();

    if (connections.length === 0) {
      console.log(chalk.yellow('没有配置的连接'));
      return;
    }

    console.log(chalk.cyan('可用连接:'));
    console.log('');

    for (const { name, config } of connections) {
      console.log(`  ${chalk.green(name.padEnd(20))} ${config.host}:${config.port}`);
    }
  };

  // REPL 循环
  const repl = async (): Promise<void> => {
    const prompt = getPrompt();

    rl.question(prompt, async (input) => {
      if (input.trim()) {
        const shouldExit = await handleCommand(input);
        if (shouldExit) {
          rl.close();
          return;
        }
      }

      // 继续 REPL
      repl();
    });
  };

  // 启动 REPL
  await repl();

  // 等待关闭
  await new Promise<void>((resolve) => {
    rl.on('close', resolve);
  });
}
```

---

## 六、打包配置

### 6.1 esbuild 配置 (esbuild.config.mjs)

```javascript
import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  outfile: 'dist/cli.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  external: [
    'dmdb',
    'fsevents',
  ],
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
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

### 6.2 package.json

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
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/dmcli.git"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3",
    "cosmiconfig": "^9.0.0",
    "js-yaml": "^4.1.0",
    "dmdb": "^1.0.0",
    "inquirer": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0",
    "@types/inquirer": "^9.0.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.0.0",
    "vitest": "^1.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

### 6.3 .npmignore

```npmignore
# 忽略所有文件
**

# 允许发布的文件
!dist/
!README.md
!LICENSE
!CHANGELOG.md
!package.json
```

---

## 七、GitHub Actions

### 7.1 CI 工作流 (.github/workflows/ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

      - name: Verify CLI
        run: node dist/cli.js --version
```

### 7.2 发布工作流 (.github/workflows/publish.yml)

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Build
        run: npm run build

      - name: Verify package
        run: npm pack --dry-run

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 八、用户使用指南

### 8.1 安装

```bash
# 全局安装
npm install -g dmcli

# 或使用 yarn
yarn global add dmcli

# 或使用 pnpm
pnpm add -g dmcli

# 临时使用
npx dmcli --help
```

### 8.2 配置文件

创建配置文件 `~/.config/dmcli/config.yaml`：

```yaml
defaults:
  host: localhost
  port: 5236
  user: SYSDBA
  charset: UTF-8

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

groups:
  development:
    - local
  production:
    - production

cli:
  defaultConnection: local
  outputFormat: table
  showTiming: true
```

### 8.3 基本使用

```bash
# 列出配置的连接
dm connection list

# 连接到数据库
dm connect local
dm connect production

# 执行查询
dm -c local query "SELECT * FROM USERS"

# 使用 JSON 格式输出
dm -c local query "SELECT * FROM USERS" --format json

# 导出到文件
dm -c local export "SELECT * FROM USERS" --format csv --output users.csv

# 执行 SQL
dm -c local exec "INSERT INTO USERS (NAME) VALUES ('张三')"

# 交互式 Shell
dm connect local --shell
```

### 8.4 交互模式命令

```bash
# 切换连接
dm [local]> \c production
dm [production]> 

# 显示当前连接
dm [production]> \s

# 列出所有连接
dm [production]> \l

# 切换 Schema
dm [production]> \u MY_SCHEMA

# 显示所有表
dm [production]> \dt

# 显示表结构
dm [production]> \d USERS

# 执行 SQL
dm [production]> SELECT * FROM USERS WHERE AGE > 18;

# 退出
dm [production]> \q
```

### 8.5 环境变量

```bash
# 设置密码
export DM_PROD_PASSWORD=your_password
export DM_STAGING_PASSWORD=staging_password

# 设置默认连接参数
export DM_HOST=192.168.1.100
export DM_PORT=5236
export DM_USER=SYSDBA

# 指定配置文件
export DMCLI_CONFIG=/path/to/config.yaml
```

---

## 九、技术要点总结

### 9.1 多连接管理实现

| 功能 | 实现方式 |
|------|----------|
| 连接配置 | YAML 配置文件 |
| 连接别名 | `connections` 配置项 |
| 连接分组 | `groups` 配置项 |
| 连接继承 | `extends` + `templates` |
| 会话切换 | `\c` 命令 |
| 密码管理 | 环境变量、加密存储、密码管理器 |

### 9.2 npm 分发关键要素

| 要素 | 配置 | 说明 |
|------|------|------|
| bin | `"dm": "dist/cli.js"` | 注册全局命令 |
| shebang | `#!/usr/bin/env node` | 声明 Node.js 运行环境 |
| files | `["dist"]` | 控制发布内容 |
| engines | `"node": ">=18"` | 约束 Node 版本 |
| prepublishOnly | 类型检查 + 测试 + 构建 | 发布前验证 |

### 9.3 达梦驱动选择

- **官方驱动 `dmdb`**：API 完整，支持连接池、流式查询
- **连接字符串格式**：`host:port/database`
- **默认端口**：5236
- **兼容模式**：dm、oracle、mysql

---

## 十、后续扩展

### 10.1 功能扩展

- [ ] 交互式 SQL Shell（REPL）
- [ ] 数据库结构导出（DDL）
- [ ] 数据导入（CSV、JSON、SQL）
- [ ] 数据库备份/恢复
- [ ] 性能分析工具
- [ ] Schema 迁移工具
- [ ] Shell 自动补全（Bash、Zsh、Fish、PowerShell）
- [ ] Man 页面生成

### 10.2 生态扩展

- [ ] VS Code 扩展
- [ ] Docker 镜像
- [ ] Homebrew Formula
- [ ] Scoop Manifest

---

*文档生成日期: 2026-06-15*
*基于 Playwright CLI、npm 最佳实践、达梦官方驱动、多数据库连接管理研究整理*
