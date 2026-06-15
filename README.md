# dmcli - 达梦数据库命令行工具

[![npm version](https://img.shields.io/npm/v/dmcli.svg)](https://www.npmjs.com/package/dmcli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

dmcli 是一个功能强大的达梦数据库命令行工具，支持多连接管理、连接池、模板继承等高级特性，帮助开发者更高效地与达梦数据库交互。

## 功能特性

- 多连接管理：支持配置和快速切换多个数据库连接
- 连接分组：按环境（开发、测试、生产）组织连接
- 模板继承：通过模板减少重复配置
- 密码安全：支持环境变量、文件、密钥环、1Password、Vault 等多种密码来源
- 连接池：内置连接池管理，优化连接性能
- 多种输出格式：支持 table、JSON、CSV、TSV 输出
- 交互式 Shell：提供交互式 SQL 执行环境，支持 Meta-commands
- Schema 管理：创建、删除、切换 Schema
- 表管理：列出、描述、创建（交互式）、删除表
- 用户管理：创建、删除、授权、角色管理
- 数据导入导出：支持 CSV、JSON、SQL 格式
- 性能分析：执行计划、慢查询分析、统计信息
- 数据库维护：表空间管理、日志管理、统计信息更新
- 跨平台：支持 Windows、Linux、macOS

## 安装

### 前置条件

- Node.js >= 18.0.0
- 达梦数据库客户端驱动

### npm 全局安装

```bash
npm install -g dmcli
```

### 从源码安装

```bash
git clone https://github.com/yourusername/dmcli.git
cd dmcli
npm install
npm run build
npm link
```

## 快速开始

### 1. 初始化配置

创建配置文件 `.dmclirc.yaml`：

```bash
dm config init
```

或手动创建配置文件，参考 [config/examples/config.example.yaml](config/examples/config.example.yaml)。

### 2. 添加连接

```bash
# 添加本地开发连接
dm connection add local --host localhost --port 5236 --user SYSDBA --password SYSDBA

# 添加测试环境连接
dm connection add test --host 192.168.1.100 --port 5236 --user test_user --database TEST_DB
```

### 3. 列出连接

```bash
dm connection list
```

### 4. 连接数据库

```bash
# 使用指定连接
dm connect local

# 使用默认连接
dm connect
```

### 5. 执行查询

```bash
# 执行 SQL 查询
dm query "SELECT * FROM SYSDBA.TEST_TABLE LIMIT 10"

# 使用指定连接执行
dm query --connection test "SELECT COUNT(*) FROM USERS"

# 输出为 JSON 格式
dm query --format json "SELECT * FROM USERS"
```

### 6. 进入交互式 Shell

```bash
dm shell
```

在交互式 Shell 中：

```sql
dm> SELECT * FROM TEST_TABLE;
dm> USE other_database;
dm> DESC test_table;
dm> :edit  -- 打开外部编辑器
dm> :history  -- 查看历史命令
dm> exit  -- 退出
```

## 配置文件说明

### 配置文件位置

dmcli 使用 cosmiconfig 按以下顺序搜索配置：

1. `package.json` 中的 `dmcli` 字段
2. `.dmclirc` / `.dmclirc.json` / `.dmclirc.yaml` / `.dmclirc.yml`
3. `.dmclirc.js` / `.dmclirc.ts` / `.dmclirc.cjs`
4. `dmcli.config.js` / `dmcli.config.ts` / `dmcli.config.cjs`
5. `.config/dmclirc` / `.config/dmclirc.json` / `.config/dmclirc.yaml` / `.config/dmclirc.yml`

用户级配置：
- Windows: `%APPDATA%\dmcli\config.yaml`
- Linux/macOS: `~/.config/dmcli/config.yaml`

### 配置优先级（从低到高）

1. 默认配置
2. 用户级配置
3. 项目级配置
4. 环境变量
5. 命令行参数

### 配置示例

```yaml
# 全局默认值
defaults:
  host: localhost
  port: 5236
  user: SYSDBA
  charset: UTF-8
  compatibleMode: dm  # dm | oracle | mysql

# 连接配置
connections:
  local:
    host: localhost
    port: 5236
    user: SYSDBA
    password: "SYSDBA"
    database: DAMENG

  test:
    host: 192.168.1.100
    port: 5236
    user: test_user
    password:
      source: env
      key: DM_TEST_PASSWORD
    database: TEST_DB

# 连接分组
groups:
  development:
    - local
  production:
    - prod-primary
    - prod-replica

# 连接模板
templates:
  base:
    charset: UTF-8
    connectTimeout: 30000

# 使用模板的扩展连接
extendedConnections:
  dev-local:
    extends: base
    host: localhost
    port: 5236
    user: SYSDBA
    password: "SYSDBA"

# CLI 行为配置
cli:
  defaultConnection: local
  outputFormat: table
  maxRows: 1000
  showTiming: true
  confirmDangerous: true

# 连接池配置
pool:
  maxSize: 10
  minIdle: 2
  acquireTimeout: 30000
  idleTimeout: 600000
  maxLifetime: 1800000
```

完整的配置示例请参考 [config/examples/config.example.yaml](config/examples/config.example.yaml)。

## 命令使用说明

### 连接管理

```bash
# 列出所有连接
dm connection list

# 添加连接
dm connection add <name> --host <host> --port <port> --user <user> [--password <password>]

# 删除连接
dm connection remove <name>

# 查看连接详情
dm connection show <name>

# 测试连接
dm connection test <name>
```

### 分组管理

```bash
# 列出所有分组
dm group list

# 创建分组
dm group create <name> --connections <conn1>,<conn2>

# 删除分组
dm group remove <name>

# 查看分组详情
dm group show <name>
```

### 查询执行

```bash
# 执行 SQL 查询
dm query <sql>

# 使用指定连接
dm query --connection <name> <sql>

# 指定输出格式
dm query --format <table|json|csv|tsv> <sql>

# 限制返回行数
dm query --limit <rows> <sql>
```

### 数据导出

```bash
# 导出查询结果到文件
dm export <sql> --output <file> --format <csv|json>

# 使用指定连接
dm export --connection <name> <sql> --output <file>
```

### 交互式 Shell

```bash
# 进入 Shell
dm shell

# 使用指定连接
dm shell --connection <name>
```

Shell 内置命令：

| 命令 | 说明 |
|------|------|
| `help` / `\?` | 显示帮助信息 |
| `tables` / `\dt` | 列出所有表 |
| `describe <table>` | 查看表结构 |
| `\dn` | 列出所有 Schema |
| `\di` | 列出所有索引 |
| `\dv` | 列出所有视图 |
| `\df` | 列出所有函数/过程 |
| `\ds` | 列出所有序列 |
| `\du` | 列出所有用户 |
| `\conninfo` | 显示当前连接信息 |
| `\timing` | 开关执行时间显示 |
| `\x` | 开关扩展显示模式 |
| `connect <name>` / `\c <name>` | 切换连接 |
| `disconnect` / `\d` | 断开连接 |
| `status` / `\s` | 显示连接状态 |
| `list` / `\l` | 列出所有连接 |
| `use <schema>` / `\u <schema>` | 切换 Schema |
| `history` | 显示命令历史 |
| `clear` / `\c` | 清屏 |
| `exit` / `quit` / `\q` | 退出 Shell |

### Schema 管理

```bash
# 列出所有 Schema
dm schema list

# 创建 Schema
dm schema create <name> --password <password>

# 删除 Schema
dm schema drop <name> --cascade

# 切换 Schema
dm schema use <name>

# 查看 Schema 对象
dm schema objects <name> --type table
```

### 表管理

```bash
# 列出表
dm table list --schema <schema>

# 查看表结构
dm table describe <table> --schema <schema>

# 交互式创建表
dm table create <name> --interactive

# 删除表
dm table drop <name> --force

# 查看表数据
dm table data <table> --limit 100 --where "id > 10"

# 索引管理
dm table index list <table>
dm table index create <table> --columns "col1,col2" --unique
```

### 用户管理

```bash
# 列出用户
dm user list

# 创建用户
dm user create <name> --password <password>

# 删除用户
dm user drop <name> --cascade

# 授权
dm user grant "CREATE TABLE" --to <user>

# 撤销权限
dm user revoke "CREATE TABLE" --from <user>

# 角色管理
dm user role list
dm user role create <name>

# 查看用户权限
dm user show <name>
```

### 数据导入导出

```bash
# CSV 导入
dm data import csv <file> --table <table> --schema <schema>

# JSON 导入
dm data import json <file> --table <table>

# SQL 导入
dm data import sql <file> --continue-on-error

# CSV 导出
dm data export csv <table> --output <file> --schema <schema>

# JSON 导出
dm data export json <table> --output <file> --pretty

# SQL 导出 (DDL)
dm data export sql <table> --output <file> --data
```

### 性能分析

```bash
# 执行计划
dm performance explain "SELECT * FROM users WHERE id = 1"

# 慢查询分析
dm performance slow --top 20

# 统计信息
dm performance stats <table> --schema <schema>
```

### 数据库维护

```bash
# 表空间管理
dm maintenance tablespace list
dm maintenance tablespace create <name> --size 100M
dm maintenance tablespace usage

# 日志管理
dm maintenance log list
dm maintenance log switch

# 统计信息更新
dm maintenance analyze <table> --schema <schema>
```

### 配置管理

```bash
# 查看当前配置
dm config show

# 初始化配置文件
dm config init

# 编辑配置文件
dm config edit

# 获取配置项值
dm config get <key>

# 设置配置项值
dm config set <key> <value>
```

### 密码管理

dmcli 支持多种密码来源，避免明文存储密码：

```yaml
# 环境变量
password:
  source: env
  key: DM_PASSWORD

# 文件
password:
  source: file
  path: /etc/dmcli/password.txt

# 系统密钥环
password:
  source: keyring
  alias: dmcli-prod

# 1Password
password:
  source: 1password
  vault: Development
  item: DM Production
  field: password

# HashiCorp Vault
password:
  source: vault
  mount: secret
  path: dm/production
```

## 环境变量

以下环境变量可覆盖配置文件中的值：

| 环境变量 | 说明 |
|---------|------|
| `DM_HOST` | 数据库主机地址 |
| `DM_PORT` | 数据库端口 |
| `DM_USER` | 数据库用户名 |
| `DM_PASSWORD` | 数据库密码 |
| `DM_DATABASE` | 数据库名称 |
| `DM_SCHEMA` | 默认 Schema |
| `DM_CHARSET` | 字符集 |
| `DM_COMPATIBLE_MODE` | 兼容模式 |
| `DM_CONNECT_TIMEOUT` | 连接超时（毫秒） |
| `DM_QUERY_TIMEOUT` | 查询超时（毫秒） |
| `DM_DEFAULT_CONNECTION` | 默认连接名称 |
| `DM_OUTPUT_FORMAT` | 默认输出格式 |
| `DM_MAX_ROWS` | 最大显示行数 |
| `DMCLI_CONFIG` | 配置文件路径 |

## 示例代码

### 使用 API

```typescript
import { createConfigManager } from 'dmcli';
import { ConnectionManager } from 'dmcli';

// 加载配置
const configManager = createConfigManager();
await configManager.load();

// 获取连接配置
const connection = configManager.getConnection('local');

// 创建连接管理器
const connectionManager = new ConnectionManager();

// 连接数据库
const conn = await connectionManager.connect(connection);

// 执行查询
const result = await conn.query('SELECT * FROM USERS');

console.log(result.rows);

// 断开连接
await connectionManager.disconnect(conn);
```

### 各语言连接示例

| 语言 | 文件 | 说明 |
|------|------|------|
| Java | [examples/java/DMConnectionExample.java](examples/java/DMConnectionExample.java) | JDBC 连接示例 |
| Python | [examples/python/dm_connection_example.py](examples/python/dm_connection_example.py) | dmPython 连接示例 |
| Go | [examples/go/dm_connection_example.go](examples/go/dm_connection_example.go) | Go 连接示例 |
| .NET | [examples/dotnet/DMConnectionExample.cs](examples/dotnet/DMConnectionExample.cs) | .NET 连接示例 |
| Node.js | [examples/nodejs/dm_connection_example.js](examples/nodejs/dm_connection_example.js) | Node.js 连接示例 |
| C/C++ | [examples/c/dm_odbc_example.c](examples/c/dm_odbc_example.c) | ODBC 连接示例 |

## 开发指南

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/yourusername/dmcli.git
cd dmcli

# 安装依赖
npm install

# 构建项目
npm run build

# 开发模式（监听文件变化）
npm run build:watch

# 运行测试
npm test

# 监听模式运行测试
npm run test:watch

# 代码检查
npm run lint

# 自动修复代码风格
npm run lint:fix

# 类型检查
npm run typecheck

# 代码格式化
npm run format
```

### 项目结构

```
dmcli/
├── src/                    # 源代码目录
│   ├── cli.ts             # CLI 入口
│   ├── commands/          # 命令实现
│   │   ├── config.ts      # 配置管理命令
│   │   ├── connect.ts     # 连接命令
│   │   ├── connection.ts  # 连接管理命令
│   │   ├── data.ts        # 数据导入导出命令
│   │   ├── exec.ts        # 执行命令
│   │   ├── export.ts      # 导出命令
│   │   ├── maintenance.ts # 数据库维护命令
│   │   ├── performance.ts # 性能分析命令
│   │   ├── query.ts       # 查询命令
│   │   ├── schema.ts      # Schema 管理命令
│   │   ├── shell.ts       # 交互式 Shell 命令
│   │   ├── table.ts       # 表管理命令
│   │   └── user.ts        # 用户管理命令
│   ├── interactive/       # 交互式 Shell
│   │   └── shell.ts
│   ├── lib/               # 核心库
│   │   ├── config-manager.ts    # 配置管理器
│   │   ├── connection-manager.ts # 连接管理器
│   │   ├── formatter.ts         # 输出格式化
│   │   └── secret-resolver.ts   # 密码解析器
│   ├── types/             # 类型定义
│   │   └── index.ts
│   └── utils/             # 工具函数
│       ├── error.ts
│       ├── logger.ts
│       └── platform.ts
├── config/                # 配置示例
│   └── examples/
│       └── config.example.yaml
├── examples/              # 代码示例
├── docs/                  # 文档
├── dist/                  # 构建输出
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── README.md
```

### 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: 添加某功能'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `perf:` 性能优化
- `test:` 测试相关
- `chore:` 构建/工具相关

## 常见问题

### 连接失败

1. 检查数据库服务是否启动
2. 确认端口号是否正确（默认 5236）
3. 检查防火墙设置
4. 验证用户名和密码

### 中文乱码

- 确保配置文件中的 charset 与数据库一致
- JDBC 连接添加参数：`?charset=UTF-8`

### 驱动问题

- 确保已安装达梦数据库客户端驱动
- 检查驱动版本与数据库版本匹配

## 相关资源

- 达梦官网：https://www.dameng.com
- 技术文档中心：https://eco.dameng.com/document/
- 技术社区：https://eco.dameng.com/community/

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

**更新日期**：2026年6月15日

**新增功能**：
- 增强交互式 Shell，支持 Meta-commands (\dn, \dt, \di, \dv, \df, \ds, \du, \timing, \x, \conninfo)
- 新增 Schema 管理命令 (dm schema)
- 新增表管理命令 (dm table)
- 新增用户管理命令 (dm user)
- 新增数据导入导出命令 (dm data)
- 新增性能分析命令 (dm performance)
- 新增数据库维护命令 (dm maintenance)
- 新增交互式 Shell 命令 (dm shell)
