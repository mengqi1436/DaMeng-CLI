/**
 * 达梦数据库 CLI 工具类型定义
 */

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
  rows: Record<string, unknown>[];
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
