/**
 * 达梦数据库 CLI 工具 - 类型定义
 *
 * 基于达梦CLI工具优化方案和完整实现方案的类型系统。
 */

// ==================== 连接配置 ====================

/**
 * 连接配置接口
 *
 * 支持直接密码字符串或通过 PasswordSpec 从外部源解析密码。
 * 通过 extends 字段可继承模板配置。
 */
export interface ConnectionConfig {
  /** 连接别名 */
  name?: string;
  /** 协议类型 */
  protocol?: string;
  /** 数据库主机地址 */
  host: string;
  /** 数据库端口 */
  port: number;
  /** 用户名 */
  user: string;
  /** 密码（字符串或密码规范对象） */
  password: string | PasswordSpec;
  /** 数据库名 */
  database?: string;
  /** 默认 Schema */
  schema?: string;
  /** 字符集 */
  charset?: string;
  /** 兼容模式: dm | oracle | mysql */
  compatibleMode?: 'dm' | 'oracle' | 'mysql';
  /** 连接超时（毫秒） */
  connectTimeout?: number;
  /** 查询超时（毫秒） */
  queryTimeout?: number;
  /** 角色: primary（主库/写）| replica（从库/读） */
  role?: 'primary' | 'replica';
  /** 继承的模板名称 */
  extends?: string;
  /** 额外连接选项 */
  options?: Record<string, string>;
}

// ==================== 密码规范 ====================

/**
 * 密码规范接口
 *
 * 支持多种密码来源：
 * - env: 从环境变量读取
 * - file: 从文件读取
 * - keyring: 从系统密钥环读取
 * - 1password: 从 1Password 读取
 * - vault: 从 HashiCorp Vault 读取
 */
export interface PasswordSpec {
  /** 密码来源类型 */
  source: 'env' | 'file' | 'keyring' | '1password' | 'vault';
  /** 环境变量名（source 为 env 时使用） */
  key?: string;
  /** 文件路径（source 为 file 时使用） */
  path?: string;
  /** 密钥环别名（source 为 keyring 时使用） */
  alias?: string;
  /** 1Password Vault 名称 */
  vault?: string;
  /** 1Password 项目名称 */
  item?: string;
  /** 1Password 字段名 */
  field?: string;
  /** Vault 挂载路径 */
  mount?: string;
}

// ==================== 连接组 ====================

/**
 * 连接组接口
 *
 * 将多个连接按环境或用途分组管理。
 */
export interface ConnectionGroup {
  /** 组名称 */
  name: string;
  /** 组内连接别名列表 */
  connections: string[];
  /** 组描述 */
  description?: string;
}

// ==================== 全局配置 ====================

/**
 * 全局配置接口
 *
 * dmcli 工具的顶层配置结构，包含默认值、连接、分组、模板、CLI 行为和连接池配置。
 */
export interface DmcliConfig {
  /** 全局默认值（被具体连接配置覆盖） */
  defaults: Partial<ConnectionConfig>;
  /** 已命名的连接配置 */
  connections: Record<string, ConnectionConfig>;
  /** 连接分组（组名 -> 连接别名列表） */
  groups: Record<string, string[]>;
  /** 连接模板（通过 extends 字段继承） */
  templates?: Record<string, Partial<ConnectionConfig>>;
  /** 使用模板的扩展连接 */
  extendedConnections?: Record<string, ConnectionConfig>;
  /** CLI 行为配置 */
  cli?: CliConfig;
  /** 连接池配置 */
  pool?: PoolConfig;
}

// ==================== CLI 配置 ====================

/**
 * CLI 配置接口
 *
 * 控制命令行工具的默认行为。
 */
export interface CliConfig {
  /** 默认连接别名 */
  defaultConnection?: string;
  /** 默认输出格式 */
  outputFormat?: 'table' | 'json' | 'csv' | 'tsv';
  /** 结果集最大显示行数 */
  maxRows?: number;
  /** 是否显示执行时间 */
  showTiming?: boolean;
  /** 是否确认危险操作（DROP, DELETE, TRUNCATE） */
  confirmDangerous?: boolean;
  /** 历史记录文件路径 */
  historyFile?: string;
  /** 外部编辑器（用于 :edit 命令） */
  editor?: string;
}

// ==================== 连接池配置 ====================

/**
 * 连接池配置接口
 *
 * 控制数据库连接池的行为参数。
 */
export interface PoolConfig {
  /** 最大连接数 */
  maxSize?: number;
  /** 最小空闲连接数 */
  minIdle?: number;
  /** 获取连接超时（毫秒） */
  acquireTimeout?: number;
  /** 空闲连接超时（毫秒） */
  idleTimeout?: number;
  /** 连接最大生命周期（毫秒） */
  maxLifetime?: number;
  /** 连接验证查询 */
  validationQuery?: string;
  /** 借出时是否验证连接 */
  testOnBorrow?: boolean;
  /** 空闲时是否验证连接 */
  testWhileIdle?: boolean;
}

// ==================== 查询结果 ====================

/**
 * 查询结果接口
 *
 * 封装 SQL 查询的返回数据。
 */
export interface QueryResult {
  /** 列名列表 */
  columns: string[];
  /** 数据行 */
  rows: Record<string, unknown>[];
  /** 影响行数 */
  rowCount: number;
  /** 执行耗时（毫秒） */
  executionTime: number;
}

// ==================== 连接状态 ====================

/**
 * 连接状态接口
 *
 * 表示一个数据库连接的当前状态。
 */
export interface ConnectionStatus {
  /** 连接别名 */
  name: string;
  /** 主机地址 */
  host: string;
  /** 端口 */
  port: number;
  /** 数据库名 */
  database?: string;
  /** Schema */
  schema?: string;
  /** 是否已建立连接 */
  connected: boolean;
  /** 是否为当前活跃连接 */
  active: boolean;
}
