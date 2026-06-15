/**
 * 配置管理器
 * 基于 cosmiconfig 最佳实践，支持多层级配置优先级
 *
 * 配置优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户级配置 (~/.config/dmcli/config.yaml)
 * 3. 项目级配置 (.dmclirc.yaml)
 * 4. 环境变量 (DM_HOST, DM_PORT, ...)
 * 5. 命令行参数
 */

import { cosmiconfig } from 'cosmiconfig';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { DmcliConfig, ConnectionConfig, CliConfig, PoolConfig } from '../types';

const MODULE_NAME = 'dmcli';

/**
 * 配置管理器类
 */
export class ConfigManager {
  private config: DmcliConfig;
  private configPath: string;
  private explorer: ReturnType<typeof cosmiconfig>;
  private loaded: boolean = false;

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
          } catch (error: unknown) {
            const err = error as Error;
            err.message = `YAML Error in ${filepath}:\n${err.message}`;
            throw err;
          }
        },
        '.yml': (filepath: string, content: string) => {
          try {
            return yaml.load(content);
          } catch (error: unknown) {
            const err = error as Error;
            err.message = `YAML Error in ${filepath}:\n${err.message}`;
            throw err;
          }
        },
      },
    });
  }

  /**
   * 加载配置
   * 按照优先级合并：默认 -> 用户级 -> 项目级 -> 环境变量
   */
  async load(): Promise<void> {
    // 1. 从默认配置开始
    let mergedConfig = this.getDefaultConfig();

    // 2. 加载用户级配置
    const userConfigPath = this.getUserConfigPath();
    if (fs.existsSync(userConfigPath)) {
      try {
        const userConfigContent = fs.readFileSync(userConfigPath, 'utf8');
        const userConfig = yaml.load(userConfigContent) as Partial<DmcliConfig>;
        mergedConfig = this.mergeConfig(mergedConfig, userConfig);
      } catch (error: unknown) {
        const err = error as Error;
        console.warn(`警告: 加载用户配置失败 (${userConfigPath}): ${err.message}`);
      }
    }

    // 3. 搜索项目级配置（cosmiconfig 会自动向上查找）
    const result = await this.explorer.search();
    if (result) {
      mergedConfig = this.mergeConfig(mergedConfig, result.config);
      this.configPath = result.filepath;
    }

    // 4. 加载环境变量（最高优先级）
    mergedConfig = this.applyEnvVars(mergedConfig);

    this.config = mergedConfig;
    this.loaded = true;
  }

  /**
   * 同步加载配置（用于测试或初始化阶段）
   */
  loadSync(): void {
    // 1. 从默认配置开始
    let mergedConfig = this.getDefaultConfig();

    // 2. 加载用户级配置
    const userConfigPath = this.getUserConfigPath();
    if (fs.existsSync(userConfigPath)) {
      try {
        const userConfigContent = fs.readFileSync(userConfigPath, 'utf8');
        const userConfig = yaml.load(userConfigContent) as Partial<DmcliConfig>;
        mergedConfig = this.mergeConfig(mergedConfig, userConfig);
      } catch (error: unknown) {
        const err = error as Error;
        console.warn(`警告: 加载用户配置失败 (${userConfigPath}): ${err.message}`);
      }
    }

    // 3. 加载环境变量
    mergedConfig = this.applyEnvVars(mergedConfig);

    this.config = mergedConfig;
    this.loaded = true;
  }

  /**
   * 确保配置已加载
   */
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('配置尚未加载，请先调用 load() 或 loadSync()');
    }
  }

  /**
   * 获取用户配置文件路径
   */
  private getUserConfigPath(): string {
    // 优先使用环境变量指定的配置文件路径
    if (process.env.DMCLI_CONFIG) {
      return process.env.DMCLI_CONFIG;
    }

    const homeDir = os.homedir();

    // Windows: %APPDATA%\dmcli\config.yaml
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      return path.join(appData, MODULE_NAME, 'config.yaml');
    }

    // Linux/macOS: ~/.config/dmcli/config.yaml (XDG 规范)
    const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
    return path.join(configHome, MODULE_NAME, 'config.yaml');
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvVars(config: DmcliConfig): DmcliConfig {
    const result = { ...config };

    // 环境变量映射表
    const envMap: Record<string, string> = {
      DM_HOST: 'defaults.host',
      DM_PORT: 'defaults.port',
      DM_USER: 'defaults.user',
      DM_PASSWORD: 'defaults.password',
      DM_DATABASE: 'defaults.database',
      DM_SCHEMA: 'defaults.schema',
      DM_CHARSET: 'defaults.charset',
      DM_COMPATIBLE_MODE: 'defaults.compatibleMode',
      DM_CONNECT_TIMEOUT: 'defaults.connectTimeout',
      DM_QUERY_TIMEOUT: 'defaults.queryTimeout',
      DM_DEFAULT_CONNECTION: 'cli.defaultConnection',
      DM_OUTPUT_FORMAT: 'cli.outputFormat',
      DM_MAX_ROWS: 'cli.maxRows',
    };

    for (const [envKey, configPath] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        this.setNestedValue(result, configPath, value);
      }
    }

    // 类型转换：端口号转为数字
    if (typeof result.defaults.port === 'string') {
      result.defaults.port = parseInt(result.defaults.port, 10);
    }
    if (typeof result.defaults.connectTimeout === 'string') {
      result.defaults.connectTimeout = parseInt(result.defaults.connectTimeout, 10);
    }
    if (typeof result.defaults.queryTimeout === 'string') {
      result.defaults.queryTimeout = parseInt(result.defaults.queryTimeout, 10);
    }

    // CLI 配置类型转换
    if (result.cli) {
      if (typeof result.cli.maxRows === 'string') {
        result.cli.maxRows = parseInt(result.cli.maxRows, 10);
      }
    }

    return result;
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
        password: '',
        charset: 'UTF-8',
        compatibleMode: 'dm',
        connectTimeout: 30000,
        queryTimeout: 60000,
      },
      connections: {},
      groups: {},
      templates: {},
      extendedConnections: {},
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
        idleTimeout: 600000,
        maxLifetime: 1800000,
        validationQuery: 'SELECT 1',
        testOnBorrow: true,
        testWhileIdle: true,
      },
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): DmcliConfig {
    this.ensureLoaded();
    return { ...this.config };
  }

  /**
   * 获取连接配置
   * 支持扩展连接和模板继承
   */
  getConnection(name: string): ConnectionConfig {
    this.ensureLoaded();

    // 先检查扩展连接
    const extendedConns = this.config.extendedConnections || {};
    if (extendedConns[name]) {
      return this.resolveExtendedConnection(name, extendedConns);
    }

    // 再检查普通连接
    const conn = this.config.connections[name];
    if (!conn) {
      const available = Object.keys(this.config.connections).join(', ');
      throw new Error(`连接 "${name}" 不存在。可用连接: ${available}`);
    }

    return this.mergeDefaults(conn);
  }

  /**
   * 解析扩展连接（支持模板继承）
   */
  private resolveExtendedConnection(
    name: string,
    extendedConns: Record<string, ConnectionConfig>
  ): ConnectionConfig {
    const conn = extendedConns[name];
    if (!conn) {
      throw new Error(`扩展连接 "${name}" 不存在`);
    }

    // 如果指定了继承模板
    if (conn.extends) {
      const templates = this.config.templates || {};
      const parent = templates[conn.extends];
      if (!parent) {
        throw new Error(`模板 "${conn.extends}" 不存在`);
      }

      // 合并模板和当前连接配置（当前配置优先）
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
    } as ConnectionConfig;
  }

  /**
   * 列出所有连接（包括普通连接和扩展连接）
   */
  listConnections(): Array<{ name: string; config: ConnectionConfig }> {
    this.ensureLoaded();
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
   * 添加连接
   */
  addConnection(name: string, config: ConnectionConfig): void {
    this.ensureLoaded();
    this.config.connections[name] = config;
    this.save();
  }

  /**
   * 更新连接
   */
  updateConnection(name: string, config: Partial<ConnectionConfig>): void {
    this.ensureLoaded();
    const existing = this.config.connections[name];
    if (!existing) {
      throw new Error(`连接 "${name}" 不存在`);
    }
    this.config.connections[name] = { ...existing, ...config };
    this.save();
  }

  /**
   * 删除连接
   */
  removeConnection(name: string): boolean {
    this.ensureLoaded();
    if (this.config.connections[name]) {
      delete this.config.connections[name];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 获取连接组
   */
  getGroup(name: string): string[] {
    this.ensureLoaded();
    const group = this.config.groups[name];
    if (!group) {
      const available = Object.keys(this.config.groups).join(', ');
      throw new Error(`连接组 "${name}" 不存在。可用组: ${available}`);
    }
    return group;
  }

  /**
   * 列出所有连接组
   */
  listGroups(): Array<{ name: string; connections: string[] }> {
    this.ensureLoaded();
    return Object.entries(this.config.groups).map(([name, connections]) => ({
      name,
      connections,
    }));
  }

  /**
   * 添加连接组
   */
  addGroup(name: string, connections: string[]): void {
    this.ensureLoaded();
    this.config.groups[name] = connections;
    this.save();
  }

  /**
   * 删除连接组
   */
  removeGroup(name: string): boolean {
    this.ensureLoaded();
    if (this.config.groups[name]) {
      delete this.config.groups[name];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 获取模板配置
   */
  getTemplate(name: string): Partial<ConnectionConfig> {
    this.ensureLoaded();
    const templates = this.config.templates || {};
    const template = templates[name];
    if (!template) {
      const available = Object.keys(templates).join(', ');
      throw new Error(`模板 "${name}" 不存在。可用模板: ${available}`);
    }
    return template;
  }

  /**
   * 列出所有模板
   */
  listTemplates(): Array<{ name: string; config: Partial<ConnectionConfig> }> {
    this.ensureLoaded();
    const templates = this.config.templates || {};
    return Object.entries(templates).map(([name, config]) => ({ name, config }));
  }

  /**
   * 添加模板
   */
  addTemplate(name: string, config: Partial<ConnectionConfig>): void {
    this.ensureLoaded();
    if (!this.config.templates) {
      this.config.templates = {};
    }
    this.config.templates[name] = config;
    this.save();
  }

  /**
   * 删除模板
   */
  removeTemplate(name: string): boolean {
    this.ensureLoaded();
    if (this.config.templates && this.config.templates[name]) {
      delete this.config.templates[name];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 获取 CLI 配置
   */
  getCliConfig(): CliConfig {
    this.ensureLoaded();
    return { ...this.config.cli };
  }

  /**
   * 更新 CLI 配置
   */
  updateCliConfig(config: Partial<CliConfig>): void {
    this.ensureLoaded();
    this.config.cli = { ...this.config.cli, ...config } as CliConfig;
    this.save();
  }

  /**
   * 获取连接池配置
   */
  getPoolConfig(): PoolConfig {
    this.ensureLoaded();
    return { ...this.config.pool };
  }

  /**
   * 更新连接池配置
   */
  updatePoolConfig(config: Partial<PoolConfig>): void {
    this.ensureLoaded();
    this.config.pool = { ...this.config.pool, ...config } as PoolConfig;
    this.save();
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 保存配置到文件
   */
  save(): void {
    const configPath = this.configPath || this.getUserConfigPath();
    const dir = path.dirname(configPath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 序列化为 YAML 并写入文件
    const yamlStr = yaml.dump(this.config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
    fs.writeFileSync(configPath, yamlStr, 'utf8');
  }

  /**
   * 导出配置为 YAML 字符串
   */
  toYaml(): string {
    this.ensureLoaded();
    return yaml.dump(this.config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  }

  /**
   * 导出配置为 JSON 字符串
   */
  toJson(): string {
    this.ensureLoaded();
    return JSON.stringify(this.config, null, 2);
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
      cli: { ...target.cli, ...source.cli } as CliConfig,
      pool: { ...target.pool, ...source.pool } as PoolConfig,
    };
  }

  /**
   * 设置嵌套值（支持点号分隔的路径）
   */
  private setNestedValue(obj: Record<string, any>, pathStr: string, value: unknown): void {
    const keys = pathStr.split('.');
    let current: Record<string, any> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = this.getDefaultConfig();
    this.configPath = '';
    this.loaded = false;
  }

  /**
   * 验证连接名称是否存在
   */
  hasConnection(name: string): boolean {
    this.ensureLoaded();
    return (
      !!this.config.connections[name] ||
      !!(this.config.extendedConnections && this.config.extendedConnections[name])
    );
  }

  /**
   * 验证组名称是否存在
   */
  hasGroup(name: string): boolean {
    this.ensureLoaded();
    return !!this.config.groups[name];
  }

  /**
   * 验证模板名称是否存在
   */
  hasTemplate(name: string): boolean {
    this.ensureLoaded();
    return !!(this.config.templates && this.config.templates[name]);
  }
}

/**
 * 创建配置管理器实例
 */
export function createConfigManager(): ConfigManager {
  return new ConfigManager();
}
