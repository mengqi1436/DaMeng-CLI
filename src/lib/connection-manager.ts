/**
 * 连接管理器 - 管理多个数据库连接
 *
 * 功能:
 * - 多连接管理: 同时维护多个数据库连接
 * - 连接切换: 在已建立的连接间快速切换
 * - 连接池支持: 通过 dmdb 驱动内置连接池
 * - 查询和执行: 封装查询与 DDL/DML 执行
 * - 密码解析: 集成 SecretResolver 处理各种密码来源
 */

import dmdb from 'dmdb';
import { ConnectionConfig, ConnectionStatus } from '../types';
import { ConfigManager } from './config-manager';
import { SecretResolver } from './secret-resolver';

/**
 * 内部连接条目
 */
interface ConnectionEntry {
  config: ConnectionConfig;
  connection: dmdb.Connection;
  active: boolean;
  createdAt: Date;
}

export class ConnectionManager {
  /** 已建立的连接映射 */
  private connections: Map<string, ConnectionEntry>;

  /** 当前活动连接名称 */
  private currentName: string | null;

  /** 配置管理器引用 */
  private configManager: ConfigManager;

  /** 密码解析器 */
  private secretResolver: SecretResolver;

  constructor(configManager: ConfigManager) {
    this.connections = new Map();
    this.currentName = null;
    this.configManager = configManager;
    this.secretResolver = new SecretResolver();
  }

  // ==================== 连接生命周期 ====================

  /**
   * 连接到数据库
   *
   * 如果目标连接已存在且处于活动状态，则直接切换为当前连接。
   * 否则根据配置建立新连接。
   *
   * @param name - 连接别名（对应配置文件中的连接名称）
   */
  async connect(name: string): Promise<void> {
    // 如果已连接，直接切换
    const existing = this.connections.get(name);
    if (existing && existing.active) {
      this.currentName = name;
      return;
    }

    // 获取连接配置
    const config = this.configManager.getConnection(name);

    // 解析密码
    const resolvedPassword = await this.secretResolver.resolve(config.password);

    // 构建连接字符串
    const dsn = this.buildDSN(config);

    try {
      // 通过 dmdb 驱动建立连接
      const connection = await dmdb.getConnection({
        connectString: dsn,
        user: config.user,
        password: resolvedPassword,
      });

      // 保存连接
      this.connections.set(name, {
        config,
        connection,
        active: true,
        createdAt: new Date(),
      });

      this.currentName = name;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`连接 "${name}" 失败: ${message}`);
    }
  }

  /**
   * 断开指定连接
   *
   * @param name - 连接别名，不传则断开当前连接
   */
  async disconnect(name?: string): Promise<void> {
    const targetName = name || this.currentName;
    if (!targetName) {
      throw new Error('没有活动的连接');
    }

    const entry = this.connections.get(targetName);
    if (entry) {
      try {
        await entry.connection.close();
      } catch {
        // 忽略关闭错误
      }
      this.connections.delete(targetName);

      // 如果断开的是当前连接，清空当前指针
      if (this.currentName === targetName) {
        // 尝试切换到另一个已有的连接
        const remaining = this.connections.keys();
        const next = remaining.next();
        this.currentName = next.done ? null : next.value;
      }
    }
  }

  /**
   * 切换到指定连接
   *
   * 如果目标连接已建立则直接切换，否则先建立连接再切换。
   *
   * @param name - 要切换到的连接别名
   */
  async switch(name: string): Promise<void> {
    const existing = this.connections.get(name);
    if (existing && existing.active) {
      this.currentName = name;
      return;
    }

    // 不存在则建立新连接
    await this.connect(name);
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [, entry] of this.connections) {
      closePromises.push(
        entry.connection.close().catch(() => {
          // 忽略关闭错误
        })
      );
    }

    await Promise.all(closePromises);
    this.connections.clear();
    this.currentName = null;
  }

  // ==================== 连接状态查询 ====================

  /**
   * 获取当前活动连接对象
   */
  getCurrentConnection(): dmdb.Connection | null {
    if (!this.currentName) {
      return null;
    }

    const entry = this.connections.get(this.currentName);
    return entry ? entry.connection : null;
  }

  /**
   * 获取当前连接别名
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

    const entry = this.connections.get(this.currentName);
    return entry ? entry.config : null;
  }

  /**
   * 列出所有连接状态
   */
  listStatus(): ConnectionStatus[] {
    const statuses: ConnectionStatus[] = [];

    for (const [name, entry] of this.connections) {
      statuses.push({
        name,
        host: entry.config.host,
        port: entry.config.port,
        database: entry.config.database,
        schema: entry.config.schema,
        connected: entry.active,
        active: name === this.currentName,
      });
    }

    return statuses;
  }

  /**
   * 获取指定连接的条目（内部使用）
   */
  private getEntry(name: string): ConnectionEntry | undefined {
    return this.connections.get(name);
  }

  // ==================== 查询与执行 ====================

  /**
   * 执行查询（SELECT 等返回结果集的语句）
   *
   * @param sql - SQL 查询语句
   * @param params - 绑定参数
   * @returns 查询结果
   */
  async query(sql: string, params?: unknown[]): Promise<dmdb.Result<any>> {
    const conn = this.getCurrentConnection();
    if (!conn) {
      throw new Error('没有活动的连接，请先连接数据库');
    }

    return conn.execute(sql, params, {
      outFormat: dmdb.OUT_FORMAT_OBJECT,
    });
  }

  /**
   * 执行 SQL（INSERT/UPDATE/DELETE/DDL 等无结果集的语句）
   *
   * 自动提交事务。
   *
   * @param sql - SQL 语句
   * @param params - 绑定参数
   * @returns 执行结果（包含 rowsAffected 等信息）
   */
  async execute(sql: string, params?: unknown[]): Promise<dmdb.Result<any>> {
    const conn = this.getCurrentConnection();
    if (!conn) {
      throw new Error('没有活动的连接，请先连接数据库');
    }

    return conn.execute(sql, params, {
      autoCommit: true,
    });
  }

  /**
   * 测试连接是否可用
   *
   * 建立临时连接并执行简单查询验证。
   *
   * @param name - 连接别名
   * @returns 是否连接成功
   */
  async test(name: string): Promise<boolean> {
    try {
      const config = this.configManager.getConnection(name);
      const resolvedPassword = await this.secretResolver.resolve(config.password);
      const dsn = this.buildDSN(config);

      const connection = await dmdb.getConnection({
        connectString: dsn,
        user: config.user,
        password: resolvedPassword,
      });

      // 执行简单查询验证连接
      await connection.execute('SELECT 1 FROM DUAL');
      await connection.close();

      return true;
    } catch {
      return false;
    }
  }

  // ==================== 内部工具方法 ====================

  /**
   * 构建 DSN 连接字符串
   *
   * 格式: host:port[/database][?charset=xxx&compatibleMode=xxx]
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
}
