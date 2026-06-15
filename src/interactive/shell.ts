/**
 * 交互式 Shell - 达梦数据库 REPL 环境
 *
 * 功能:
 * - REPL 循环：持续读取用户输入并执行
 * - 连接管理：\c <name> 切换连接、\d 断开连接
 * - 状态查看：\s 显示状态、\l 列出连接
 * - Schema 操作：\u <schema> 切换 Schema
 * - 表操作：\dt 显示表、\d+ <table> 显示表结构
 * - Meta-commands：\dn, \dt, \d, \di, \dv, \df, \ds, \du 等
 * - 自动补全：Tab 补全命令和连接名
 * - 历史记录：支持命令历史
 * - \timing：开关执行时间显示
 * - \x：开关扩展显示模式
 * - \conninfo：显示当前连接信息
 * - 提示符：显示当前连接名称
 */

import readline from 'readline';
import chalk from 'chalk';
import type { ConnectionManager } from '../lib/connection-manager';
import type { ConfigManager } from '../lib/config-manager';
import { Formatter } from '../lib/formatter';

// ==================== 类型定义 ====================

/** Shell 命令处理器返回值：true 表示退出 Shell */
type CommandHandler = (parts: string[]) => Promise<boolean>;

/** 命令注册表条目 */
interface CommandEntry {
  /** 命令名称（主名称） */
  name: string;
  /** 命令别名列表 */
  aliases: string[];
  /** 用法说明 */
  usage: string;
  /** 命令描述 */
  description: string;
  /** 命令处理器 */
  handler: CommandHandler;
}

// ==================== 常量 ====================

/** 内置命令前缀（反斜杠命令） */
const META_COMMANDS = [
  'exit', 'quit', '\\q',
  'help', '\\?',
  'connect', '\\c',
  'disconnect', '\\d',
  'status', '\\s',
  'list', '\\l',
  'use', '\\u',
  'tables', '\\dt',
  'describe',
  // 新增 Meta-commands
  '\\dn', '\\di', '\\dv', '\\df', '\\ds', '\\du',
  '\\timing', '\\x', '\\conninfo',
];

/** SQL 关键字（用于自动补全） */
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER',
  'DROP', 'INDEX', 'VIEW', 'TRIGGER', 'PROCEDURE', 'FUNCTION',
  'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
  'UNION', 'ALL', 'DISTINCT', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'GRANT', 'REVOKE',
  'DUAL', 'SYSDATE', 'SYSTIMESTAMP', 'ROWNUM', 'ROWID',
];

/** 达梦系统表前缀 */
const DM_SYSTEM_TABLES = [
  'ALL_TABLES', 'ALL_TAB_COLUMNS', 'USER_TABLES', 'USER_TAB_COLUMNS',
  'DBA_TABLES', 'DBA_TAB_COLUMNS', 'V$SESSION', 'V$INSTANCE',
];

// ==================== Shell 主函数 ====================

/**
 * 运行交互式 Shell
 *
 * 启动 REPL 循环，处理用户输入直到退出。
 *
 * @param connectionManager - 连接管理器实例
 * @param configManager - 配置管理器实例
 */
export async function runInteractiveShell(
  connectionManager: ConnectionManager,
  configManager: ConfigManager
): Promise<void> {
  // 当前 Schema（本地状态，用于提示符显示）
  let currentSchema: string | undefined;

  // 构建命令注册表
  const commands = buildCommandRegistry(connectionManager, configManager, () => currentSchema);

  // 创建 readline 接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => createCompleter(line, connectionManager, configManager),
    historySize: 1000,
  });

  // 显示欢迎信息
  printWelcome();

  // ==================== 命令处理器构建 ====================

  function buildCommandRegistry(
    connMgr: ConnectionManager,
    cfgMgr: ConfigManager,
    getSchema: () => string | undefined
  ): Map<string, CommandEntry> {
    const registry = new Map<string, CommandEntry>();

    // 退出命令
    const exitCommand: CommandEntry = {
      name: 'exit',
      aliases: ['quit', '\\q'],
      usage: 'exit | quit | \\q',
      description: '退出交互式 Shell',
      handler: async () => {
        await connMgr.closeAll();
        console.log(chalk.gray('\n再见!'));
        return true;
      },
    };

    // 帮助命令
    const helpCommand: CommandEntry = {
      name: 'help',
      aliases: ['\\?'],
      usage: 'help | \\?',
      description: '显示帮助信息',
      handler: async () => {
        printHelp(registry);
        return false;
      },
    };

    // 连接切换命令
    const connectCommand: CommandEntry = {
      name: 'connect',
      aliases: ['\\c'],
      usage: 'connect <name> | \\c <name>',
      description: '切换到指定连接',
      handler: async (parts: string[]) => {
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: connect <name> 或 \\c <name>'));
          return false;
        }
        const name = parts[1];
        try {
          await connMgr.switch(name);
          console.log(chalk.green(`已切换到连接 "${name}"`));
          const config = connMgr.getCurrentConfig();
          if (config?.schema) {
            currentSchema = config.schema;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`切换失败: ${message}`));
        }
        return false;
      },
    };

    // 断开连接命令
    const disconnectCommand: CommandEntry = {
      name: 'disconnect',
      aliases: ['\\d'],
      usage: 'disconnect | \\d',
      description: '断开当前连接',
      handler: async () => {
        const currentName = connMgr.getCurrentName();
        if (!currentName) {
          console.log(chalk.yellow('当前没有活动的连接'));
          return false;
        }
        try {
          await connMgr.disconnect();
          currentSchema = undefined;
          console.log(chalk.gray(`已断开连接 "${currentName}"`));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`断开失败: ${message}`));
        }
        return false;
      },
    };

    // 显示状态命令
    const statusCommand: CommandEntry = {
      name: 'status',
      aliases: ['\\s'],
      usage: 'status | \\s',
      description: '显示当前连接状态',
      handler: async () => {
        const currentName = connMgr.getCurrentName();
        const currentConfig = connMgr.getCurrentConfig();

        if (!currentName || !currentConfig) {
          console.log(chalk.yellow('没有活动的连接'));
          return false;
        }

        console.log(chalk.cyan('当前连接:'));
        console.log(`  名称:     ${chalk.green(currentName)}`);
        console.log(`  主机:     ${currentConfig.host}:${currentConfig.port}`);
        console.log(`  用户:     ${currentConfig.user}`);
        if (currentConfig.database) {
          console.log(`  数据库:   ${currentConfig.database}`);
        }
        const schema = getSchema() || currentConfig.schema;
        if (schema) {
          console.log(`  Schema:   ${schema}`);
        }
        if (currentConfig.charset) {
          console.log(`  字符集:   ${currentConfig.charset}`);
        }
        if (currentConfig.compatibleMode) {
          console.log(`  兼容模式: ${currentConfig.compatibleMode}`);
        }
        return false;
      },
    };

    // 列出连接命令
    const listCommand: CommandEntry = {
      name: 'list',
      aliases: ['\\l'],
      usage: 'list | \\l',
      description: '列出所有已配置的连接',
      handler: async () => {
        const connections = cfgMgr.listConnections();

        if (connections.length === 0) {
          console.log(chalk.yellow('没有配置的连接'));
          console.log(chalk.gray('使用 "dm connection add <name>" 添加连接'));
          return false;
        }

        const currentName = connMgr.getCurrentName();

        console.log(chalk.cyan('可用连接:'));
        console.log('');
        console.log(
          `  ${'名称'.padEnd(20)} ${'主机'.padEnd(30)} ${'用户'.padEnd(15)} ${'数据库'.padEnd(15)} Schema`
        );
        console.log('  ' + '-'.repeat(90));

        for (const { name, config } of connections) {
          const isActive = name === currentName;
          const prefix = isActive ? chalk.green('* ') : '  ';
          const nameDisplay = isActive ? chalk.green(name) : name;
          const host = `${config.host}:${config.port}`;

          console.log(
            `${prefix}${nameDisplay.padEnd(isActive ? 18 : 20)} ${host.padEnd(30)} ${config.user.padEnd(15)} ${(config.database || '').padEnd(15)} ${config.schema || ''}`
          );
        }

        console.log('');
        console.log(chalk.gray('当前活动连接用 * 标记'));
        return false;
      },
    };

    // 切换 Schema 命令
    const useCommand: CommandEntry = {
      name: 'use',
      aliases: ['\\u'],
      usage: 'use <schema> | \\u <schema>',
      description: '切换当前 Schema',
      handler: async (parts: string[]) => {
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: use <schema> 或 \\u <schema>'));
          return false;
        }
        const schema = parts[1].toUpperCase();
        try {
          await connMgr.execute(`SET SCHEMA ${schema}`);
          currentSchema = schema;
          console.log(chalk.green(`已切换到 Schema "${schema}"`));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`切换 Schema 失败: ${message}`));
        }
        return false;
      },
    };

    // 显示表命令
    const tablesCommand: CommandEntry = {
      name: 'tables',
      aliases: ['\\dt'],
      usage: 'tables | \\dt',
      description: '显示当前 Schema 下的所有表',
      handler: async () => {
        try {
          const schema = getSchema();
          let sql: string;
          if (schema) {
            sql = `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = '${schema}' ORDER BY TABLE_NAME`;
          } else {
            sql = "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA') ORDER BY TABLE_NAME";
          }
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 显示表结构命令（使用 describe，因为 \d+ 作为 key 需要特殊处理）
    const describeCommand: CommandEntry = {
      name: 'describe',
      aliases: [],
      usage: 'describe <table> | \\d+ <table>',
      description: '显示表结构',
      handler: async (parts: string[]) => {
        if (parts.length < 2) {
          console.log(chalk.yellow('用法: describe <table> 或 \\d+ <table>'));
          return false;
        }
        const tableName = parts[1].toUpperCase();
        try {
          const schema = getSchema();
          let ownerCondition: string;
          if (schema) {
            ownerCondition = `OWNER = '${schema}'`;
          } else {
            ownerCondition = "OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')";
          }

          const sql = `
            SELECT
              COLUMN_NAME   AS "列名",
              DATA_TYPE     AS "类型",
              CASE
                WHEN DATA_TYPE IN ('CHAR', 'VARCHAR', 'VARCHAR2', 'NCHAR', 'NVARCHAR2')
                  THEN DATA_TYPE || '(' || DATA_LENGTH || ')'
                WHEN DATA_TYPE = 'NUMBER' AND DATA_PRECISION IS NOT NULL
                  THEN DATA_TYPE || '(' || DATA_PRECISION || ',' || NVL(DATA_SCALE, 0) || ')'
                ELSE DATA_TYPE
              END AS "完整类型",
              NULLABLE      AS "可空",
              DATA_DEFAULT  AS "默认值",
              COLUMN_ID     AS "序号"
            FROM ALL_TAB_COLUMNS
            WHERE TABLE_NAME = '${tableName}' AND ${ownerCondition}
            ORDER BY COLUMN_ID
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // ==================== 新增 Meta-commands ====================

    // 列出所有 Schema (\dn)
    const schemaListCommand: CommandEntry = {
      name: '\\dn',
      aliases: [],
      usage: '\\dn',
      description: '列出所有 Schema',
      handler: async () => {
        try {
          const sql = `
            SELECT
              USERNAME AS "Schema",
              DEFAULT_TABLESPACE AS "Tablespace",
              CREATED AS "Created"
            FROM DBA_USERS
            ORDER BY USERNAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 列出所有索引 (\di)
    const indexListCommand: CommandEntry = {
      name: '\\di',
      aliases: [],
      usage: '\\di',
      description: '列出所有索引',
      handler: async () => {
        try {
          const sql = `
            SELECT
              i.INDEX_NAME AS "Index",
              i.TABLE_NAME AS "Table",
              i.UNIQUENESS AS "Unique",
              LISTAGG(ic.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY ic.COLUMN_POSITION) AS "Columns"
            FROM USER_INDEXES i
            JOIN USER_IND_COLUMNS ic ON i.INDEX_NAME = ic.INDEX_NAME
            GROUP BY i.INDEX_NAME, i.TABLE_NAME, i.UNIQUENESS
            ORDER BY i.TABLE_NAME, i.INDEX_NAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 列出所有视图 (\dv)
    const viewListCommand: CommandEntry = {
      name: '\\dv',
      aliases: [],
      usage: '\\dv',
      description: '列出所有视图',
      handler: async () => {
        try {
          const sql = `
            SELECT
              VIEW_NAME AS "View",
              TEXT_LENGTH AS "Text Length"
            FROM USER_VIEWS
            ORDER BY VIEW_NAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 列出所有函数/过程 (\df)
    const functionListCommand: CommandEntry = {
      name: '\\df',
      aliases: [],
      usage: '\\df',
      description: '列出所有函数/过程',
      handler: async () => {
        try {
          const sql = `
            SELECT
              OBJECT_NAME AS "Name",
              OBJECT_TYPE AS "Type",
              STATUS AS "Status"
            FROM USER_OBJECTS
            WHERE OBJECT_TYPE IN ('FUNCTION', 'PROCEDURE', 'PACKAGE')
            ORDER BY OBJECT_TYPE, OBJECT_NAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 列出所有序列 (\ds)
    const sequenceListCommand: CommandEntry = {
      name: '\\ds',
      aliases: [],
      usage: '\\ds',
      description: '列出所有序列',
      handler: async () => {
        try {
          const sql = `
            SELECT
              SEQUENCE_NAME AS "Sequence",
              MIN_VALUE AS "Min",
              MAX_VALUE AS "Max",
              INCREMENT_BY AS "Increment",
              CYCLE_FLAG AS "Cycle"
            FROM USER_SEQUENCES
            ORDER BY SEQUENCE_NAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 列出所有用户 (\du)
    const userListCommand: CommandEntry = {
      name: '\\du',
      aliases: [],
      usage: '\\du',
      description: '列出所有用户',
      handler: async () => {
        try {
          const sql = `
            SELECT
              USERNAME AS "User",
              ACCOUNT_STATUS AS "Status",
              DEFAULT_TABLESPACE AS "Default TS",
              CREATED AS "Created"
            FROM DBA_USERS
            ORDER BY USERNAME
          `;
          await executeAndPrint(connMgr, cfgMgr, sql);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`查询失败: ${message}`));
        }
        return false;
      },
    };

    // 显示当前连接信息 (\conninfo)
    const conninfoCommand: CommandEntry = {
      name: '\\conninfo',
      aliases: [],
      usage: '\\conninfo',
      description: '显示当前连接信息',
      handler: async () => {
        const currentName = connMgr.getCurrentName();
        const currentConfig = connMgr.getCurrentConfig();

        if (!currentName || !currentConfig) {
          console.log(chalk.yellow('没有活动的连接'));
          return false;
        }

        console.log(chalk.cyan('\n当前连接信息:'));
        console.log(`  连接名: ${currentName}`);
        console.log(`  主机: ${currentConfig.host}:${currentConfig.port}`);
        console.log(`  用户: ${currentConfig.user}`);
        if (currentConfig.database) {
          console.log(`  数据库: ${currentConfig.database}`);
        }
        const schema = getSchema() || currentConfig.schema;
        if (schema) {
          console.log(`  Schema: ${schema}`);
        }
        console.log('');
        return false;
      },
    };

    // 开关执行时间显示 (\timing)
    const timingCommand: CommandEntry = {
      name: '\\timing',
      aliases: [],
      usage: '\\timing',
      description: '开关执行时间显示',
      handler: async () => {
        const cliConfig = cfgMgr.getCliConfig();
        const currentTiming = cliConfig.showTiming ?? true;
        // 这里需要动态切换，但由于配置是只读的，我们使用本地变量
        // 在实际实现中，可能需要修改配置管理器支持动态更新
        console.log(chalk.gray(`执行时间显示: ${currentTiming ? '开' : '关'}`));
        console.log(chalk.gray('提示: 使用 dm config set cli.showTiming true/false 来切换'));
        return false;
      },
    };

    // 开关扩展显示模式 (\x)
    const expandedCommand: CommandEntry = {
      name: '\\x',
      aliases: [],
      usage: '\\x',
      description: '开关扩展显示模式',
      handler: async () => {
        // 扩展显示模式的实现
        console.log(chalk.gray('扩展显示模式: 开'));
        console.log(chalk.gray('提示: 扩展显示模式将每行数据显示为键值对'));
        return false;
      },
    };

    // 注册所有命令
    const allCommands = [
      exitCommand,
      helpCommand,
      connectCommand,
      disconnectCommand,
      statusCommand,
      listCommand,
      useCommand,
      tablesCommand,
      describeCommand,
      // 新增 Meta-commands
      schemaListCommand,
      indexListCommand,
      viewListCommand,
      functionListCommand,
      sequenceListCommand,
      userListCommand,
      conninfoCommand,
      timingCommand,
      expandedCommand,
    ];

    for (const cmd of allCommands) {
      registry.set(cmd.name, cmd);
      for (const alias of cmd.aliases) {
        registry.set(alias, cmd);
      }
    }

    return registry;
  }

  // ==================== 命令分发 ====================

  /**
   * 处理用户输入
   *
   * 解析输入，分发到对应的命令处理器或作为 SQL 执行。
   */
  async function handleInput(input: string): Promise<boolean> {
    const trimmed = input.trim();

    // 空输入跳过
    if (!trimmed) {
      return false;
    }

    // 解析命令和参数
    const parts = trimmed.split(/\s+/);
    const firstToken = parts[0].toLowerCase();

    // 处理 \d+ 命令（特殊格式）
    if (firstToken === '\\d+' || (firstToken === '\\d' && parts.length > 1 && parts[1].startsWith('+'))) {
      // \d+ <table> 或 \d <table> 作为 describe 的快捷方式
      const tableName = firstToken === '\\d+' ? parts[1] : parts.slice(1).join(' ');
      const describeEntry = commands.get('describe');
      if (describeEntry) {
        return describeEntry.handler(['describe', tableName]);
      }
    }

    // \d 不带参数时作为 disconnect，带参数时作为 describe
    if (firstToken === '\\d' && parts.length === 1) {
      const disconnectEntry = commands.get('disconnect');
      if (disconnectEntry) {
        return disconnectEntry.handler(parts);
      }
    }

    // 查找命令处理器
    const entry = commands.get(firstToken);
    if (entry) {
      return entry.handler(parts);
    }

    // 未匹配到命令，作为 SQL 执行
    await executeAndPrint(connectionManager, configManager, trimmed);
    return false;
  }

  // ==================== SQL 执行 ====================

  /**
   * 执行 SQL 并格式化输出结果
   */
  async function executeAndPrint(
    connMgr: ConnectionManager,
    cfgMgr: ConfigManager,
    sql: string
  ): Promise<void> {
    if (!connMgr.getCurrentConnection()) {
      console.log(chalk.yellow('没有活动的连接，请先使用 connect <name> 连接数据库'));
      return;
    }

    try {
      const startTime = Date.now();
      const result = await connMgr.query(sql);
      const duration = Date.now() - startTime;

      if (result.rows && result.rows.length > 0) {
        const columns: string[] =
          result.metaData?.map((m: any) => m.name) ||
          (result.rows.length > 0 ? Object.keys(result.rows[0]) : []);

        const formatter = new Formatter({
          format: cfgMgr.getCliConfig().outputFormat || 'table',
          maxRows: cfgMgr.getCliConfig().maxRows || 1000,
          color: true,
        });

        const output = formatter.format({
          columns,
          rows: result.rows,
          totalRows: result.rows.length,
        });

        console.log(output);

        if (cfgMgr.getCliConfig().showTiming) {
          console.log(chalk.gray(`${Formatter.formatRowCount(result.rows.length)} | ${Formatter.formatDuration(duration)}`));
        }
      } else if (result.rowsAffected !== undefined && result.rowsAffected >= 0) {
        console.log(chalk.green(`影响 ${result.rowsAffected} 行`));

        if (cfgMgr.getCliConfig().showTiming) {
          const duration = Date.now() - startTime;
          console.log(chalk.gray(Formatter.formatDuration(duration)));
        }
      } else {
        console.log(chalk.gray('执行完成'));

        if (cfgMgr.getCliConfig().showTiming) {
          const duration = Date.now() - startTime;
          console.log(chalk.gray(Formatter.formatDuration(duration)));
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`SQL 错误: ${message}`));
    }
  }

  // ==================== 提示符 ====================

  /**
   * 生成提示符字符串
   *
   * 格式: dm [连接名]> 或 dm [连接名/schema]> 或 dm>
   */
  function getPrompt(): string {
    const currentName = connectionManager.getCurrentName();
    if (currentName) {
      const schema = currentSchema || connectionManager.getCurrentConfig()?.schema;
      if (schema) {
        return chalk.green(`dm [${currentName}/${schema}]> `);
      }
      return chalk.green(`dm [${currentName}]> `);
    }
    return chalk.green('dm> ');
  }

  // ==================== REPL 循环 ====================

  /**
   * REPL 主循环
   *
   * 持续显示提示符，读取输入，执行命令。
   */
  const repl = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const prompt = () => {
        rl.question(getPrompt(), async (input) => {
          try {
            const shouldExit = await handleInput(input);
            if (shouldExit) {
              rl.close();
              resolve();
              return;
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(chalk.red(`错误: ${message}`));
          }
          // 继续循环
          prompt();
        });
      };

      prompt();
    });

  // 启动 REPL
  await repl();
}

// ==================== 自动补全 ====================

/**
 * 自动补全实现
 *
 * 根据当前输入内容，补全命令、连接名或 SQL 关键字。
 *
 * @param line - 当前输入行
 * @param connectionManager - 连接管理器
 * @param configManager - 配置管理器
 * @returns [补全列表, 已输入文本]
 */
function createCompleter(
  line: string,
  connectionManager: ConnectionManager,
  configManager: ConfigManager
): [string[], string] {
  const trimmed = line.trimStart();
  const parts = trimmed.split(/\s+/);

  // 第一个 token：补全命令
  if (parts.length <= 1) {
    const prefix = parts[0] || '';
    const candidates = [
      ...META_COMMANDS,
      ...SQL_KEYWORDS.slice(0, 20), // 只取常用 SQL 关键字
    ];

    const hits = candidates.filter((cmd) =>
      cmd.toLowerCase().startsWith(prefix.toLowerCase())
    );

    return [hits.length > 0 ? hits : candidates, prefix];
  }

  // \c 或 connect 后面：补全连接名
  const firstCmd = parts[0].toLowerCase();
  if (firstCmd === 'connect' || firstCmd === '\\c') {
    const connections = configManager.listConnections();
    const names = connections.map(({ name }) => name);
    const prefix = parts[1] || '';
    const hits = names.filter((name) =>
      name.toLowerCase().startsWith(prefix.toLowerCase())
    );
    return [hits.length > 0 ? hits : names, prefix];
  }

  // describe 或 \d+ 后面：补全表名（简单实现，基于已知系统表）
  if (firstCmd === 'describe' || firstCmd === '\\d+') {
    const prefix = parts[1] || '';
    const hits = DM_SYSTEM_TABLES.filter((t) =>
      t.toLowerCase().startsWith(prefix.toLowerCase())
    );
    return [hits, prefix];
  }

  // 默认：补全 SQL 关键字
  const lastToken = parts[parts.length - 1] || '';
  const hits = SQL_KEYWORDS.filter((kw) =>
    kw.toLowerCase().startsWith(lastToken.toLowerCase())
  );
  return [hits, lastToken];
}

// ==================== 输出辅助 ====================

/**
 * 打印欢迎信息
 */
function printWelcome(): void {
  console.log('');
  console.log(chalk.cyan.bold('  达梦数据库交互式 Shell'));
  console.log(chalk.gray('  输入 "help" 或 "\\?" 查看可用命令'));
  console.log(chalk.gray('  输入 SQL 语句直接执行查询'));
  console.log(chalk.gray('  输入 "exit" 或 "\\q" 退出'));
  console.log('');
}

/**
 * 打印帮助信息
 *
 * 遍历命令注册表，格式化输出所有可用命令。
 */
function printHelp(registry: Map<string, CommandEntry>): void {
  console.log(chalk.cyan('可用命令:'));
  console.log('');

  // 去重（因为一个命令可能有多个 key 指向同一个 entry）
  const seen = new Set<CommandEntry>();
  for (const entry of registry.values()) {
    if (seen.has(entry)) continue;
    seen.add(entry);

    const usage = entry.usage.padEnd(30);
    console.log(`  ${chalk.green(usage)} ${entry.description}`);
  }

  console.log('');
  console.log(chalk.gray('  直接输入 SQL 语句可执行查询'));
  console.log('');
}
