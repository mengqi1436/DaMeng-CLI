/**
 * 用户管理命令 - 管理数据库用户和角色
 *
 * 功能:
 * - user list: 列出所有用户
 * - user create <name>: 创建用户
 * - user drop <name>: 删除用户
 * - user grant <privileges> --to <user>: 授权
 * - user revoke <privileges> --from <user>: 撤销权限
 * - user role list: 列出角色
 * - user role create <name>: 创建角色
 * - user show <name>: 查看用户权限
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, confirm } from '@inquirer/prompts';
import Table from 'cli-table3';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import { DmcliError, ErrorCode } from '../utils/error';

/**
 * 确保已连接数据库
 */
async function ensureConnected(
  configManager: ConfigManager,
  connectionManager: ConnectionManager,
  command: Command
): Promise<void> {
  if (connectionManager.getCurrentConnection()) {
    return;
  }

  const parentOpts = command.parent?.opts() || {};
  const connectionName = parentOpts.connection as string | undefined;

  if (connectionName) {
    await connectionManager.connect(connectionName);
    return;
  }

  const cliConfig = configManager.getCliConfig();
  if (cliConfig.defaultConnection) {
    await connectionManager.connect(cliConfig.defaultConnection);
    return;
  }

  throw new DmcliError(
    '请指定连接 (-c <name>) 或设置默认连接',
    ErrorCode.CONNECTION_NOT_FOUND
  );
}

/**
 * 格式化表格输出
 */
function printTable(columns: string[], rows: any[] | undefined): void {
  if (!rows || rows.length === 0) {
    console.log(chalk.yellow('无数据'));
    return;
  }

  const table = new Table({
    head: columns.map((col) => chalk.cyan(col)),
    style: { head: ['cyan'], border: ['grey'] },
    wordWrap: true,
  });

  for (const row of rows) {
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
}

/**
 * 创建用户管理命令
 */
export function userCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('user')
    .description('用户管理');

  // ==================== user list ====================
  cmd
    .command('list')
    .alias('ls')
    .description('列出所有用户')
    .option('--status <status>', '按状态筛选 (OPEN|LOCKED|EXPIRED)')
    .action(async (options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora('查询用户列表...').start();

        let sql = `
          SELECT
            USERNAME AS "用户名",
            ACCOUNT_STATUS AS "状态",
            DEFAULT_TABLESPACE AS "默认表空间",
            CREATED AS "创建时间",
            LAST_LOGIN AS "最后登录"
          FROM DBA_USERS
        `;

        if (options.status) {
          sql += ` WHERE ACCOUNT_STATUS LIKE '%${options.status.toUpperCase()}%'`;
        }

        sql += ' ORDER BY USERNAME';

        const result = await connectionManager.query(sql);
        spinner.stop();

        const columns = ['用户名', '状态', '默认表空间', '创建时间', '最后登录'];
        printTable(columns, result.rows);

        console.log(chalk.gray(`\n共 ${result.rows?.length ?? 0} 个用户`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user create ====================
  cmd
    .command('create <name>')
    .description('创建用户')
    .option('-p, --password <password>', '用户密码')
    .option('-t, --tablespace <ts>', '默认表空间')
    .option('--quota <size>', '表空间配额 (如 100M, 1G)')
    .option('--profile <profile>', '用户配置文件')
    .action(async (name: string, options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);

        // 如果没有指定密码，交互式输入
        let password = options.password;
        if (!password) {
          password = await input({
            message: `请输入用户 "${name}" 的密码:`,
            validate: (v) => v.length >= 1 || '密码不能为空',
          });

          await input({
            message: '请确认密码:',
            validate: (v) => v === password || '两次输入的密码不一致',
          });
        }

        const spinner = ora(`创建用户 "${name}"...`).start();

        // 构建 CREATE USER 语句
        let sql = `CREATE USER ${name} IDENTIFIED BY "${password}"`;

        if (options.tablespace) {
          sql += ` DEFAULT TABLESPACE ${options.tablespace}`;
        }

        if (options.quota) {
          sql += ` QUOTA ${options.quota} ON ${options.tablespace || 'USERS'}`;
        }

        if (options.profile) {
          sql += ` PROFILE ${options.profile}`;
        }

        await connectionManager.execute(sql);

        // 授予基本连接权限
        await connectionManager.execute(`GRANT CREATE SESSION TO ${name}`);

        spinner.succeed(chalk.green(`用户 "${name}" 创建成功`));
        console.log(chalk.gray('已授予 CREATE SESSION 权限'));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`创建用户失败: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user drop ====================
  cmd
    .command('drop <name>')
    .description('删除用户')
    .option('--cascade', '级联删除用户的所有对象', false)
    .option('--force', '跳过确认', false)
    .action(async (name: string, options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);

        // 确认删除
        if (!options.force) {
          const confirmed = await confirm({
            message: `确认删除用户 "${name}"? ${options.cascade ? '(包含所有对象)' : ''}`,
            default: false,
          });

          if (!confirmed) {
            console.log(chalk.gray('已取消'));
            return;
          }
        }

        const spinner = ora(`删除用户 "${name}"...`).start();

        let sql = `DROP USER ${name}`;
        if (options.cascade) {
          sql += ' CASCADE';
        }

        await connectionManager.execute(sql);
        spinner.succeed(chalk.green(`用户 "${name}" 已删除`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`删除用户失败: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user grant ====================
  cmd
    .command('grant <privileges>')
    .description('授予用户权限')
    .requiredOption('-t, --to <user>', '目标用户')
    .option('--with-admin-option', '允许转授权限', false)
    .action(async (privileges: string, options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora('授予权限...').start();

        let sql = `GRANT ${privileges} TO ${options.to}`;
        if (options.withAdminOption) {
          sql += ' WITH ADMIN OPTION';
        }

        await connectionManager.execute(sql);
        spinner.succeed(chalk.green(`已授予 ${options.to} 权限: ${privileges}`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`授权失败: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user revoke ====================
  cmd
    .command('revoke <privileges>')
    .description('撤销用户权限')
    .requiredOption('-f, --from <user>', '目标用户')
    .action(async (privileges: string, options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora('撤销权限...').start();

        const sql = `REVOKE ${privileges} FROM ${options.from}`;
        await connectionManager.execute(sql);
        spinner.succeed(chalk.green(`已撤销 ${options.from} 的权限: ${privileges}`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`撤销权限失败: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user role 子命令 ====================
  const roleCmd = cmd
    .command('role')
    .description('角色管理');

  // user role list
  roleCmd
    .command('list')
    .alias('ls')
    .description('列出所有角色')
    .action(async (_, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora('查询角色列表...').start();

        const sql = `
          SELECT
            ROLE AS "角色",
            PASSWORD_REQUIRED AS "需要密码",
            AUTHENTICATION_TYPE AS "认证类型"
          FROM DBA_ROLES
          ORDER BY ROLE
        `;

        const result = await connectionManager.query(sql);
        spinner.stop();

        const columns = ['角色', '需要密码', '认证类型'];
        printTable(columns, result.rows);

        console.log(chalk.gray(`\n共 ${result.rows?.length ?? 0} 个角色`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
        process.exit(1);
      }
    });

  // user role create
  roleCmd
    .command('create <name>')
    .description('创建角色')
    .option('-p, --password <password>', '角色密码')
    .action(async (name: string, options, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora(`创建角色 "${name}"...`).start();

        let sql = `CREATE ROLE ${name}`;
        if (options.password) {
          sql += ` IDENTIFIED BY "${options.password}"`;
        }

        await connectionManager.execute(sql);
        spinner.succeed(chalk.green(`角色 "${name}" 创建成功`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`创建角色失败: ${message}`));
        process.exit(1);
      }
    });

  // ==================== user show ====================
  cmd
    .command('show <name>')
    .description('查看用户权限')
    .action(async (name: string, _, command) => {
      try {
        await ensureConnected(configManager, connectionManager, command);
        const spinner = ora(`查询用户 "${name}" 的权限...`).start();

        // 查询用户信息
        const userSql = `
          SELECT
            USERNAME AS "用户名",
            ACCOUNT_STATUS AS "状态",
            DEFAULT_TABLESPACE AS "默认表空间",
            TEMPORARY_TABLESPACE AS "临时表空间",
            CREATED AS "创建时间",
            PROFILE AS "配置文件"
          FROM DBA_USERS
          WHERE USERNAME = '${name.toUpperCase()}'
        `;
        const userResult = await connectionManager.query(userSql);

        if (!userResult.rows || userResult.rows.length === 0) {
          spinner.fail(chalk.red(`用户 "${name}" 不存在`));
          return;
        }

        spinner.stop();

        // 显示用户基本信息
        console.log(chalk.cyan('\n用户信息:'));
        const userColumns = ['用户名', '状态', '默认表空间', '临时表空间', '创建时间', '配置文件'];
        printTable(userColumns, userResult.rows);

        // 查询系统权限
        const sysPrivSql = `
          SELECT
            PRIVILEGE AS "权限",
            ADMIN_OPTION AS "可转授"
          FROM DBA_SYS_PRIVS
          WHERE GRANTEE = '${name.toUpperCase()}'
          ORDER BY PRIVILEGE
        `;
        const sysPrivResult = await connectionManager.query(sysPrivSql);

        console.log(chalk.cyan('\n系统权限:'));
        if (sysPrivResult.rows && sysPrivResult.rows.length > 0) {
          printTable(['权限', '可转授'], sysPrivResult.rows);
        } else {
          console.log(chalk.gray('  无'));
        }

        // 查询对象权限
        const objPrivSql = `
          SELECT
            OWNER AS "所有者",
            TABLE_NAME AS "对象",
            PRIVILEGE AS "权限",
            GRANTABLE AS "可转授"
          FROM DBA_TAB_PRIVS
          WHERE GRANTEE = '${name.toUpperCase()}'
          ORDER BY OWNER, TABLE_NAME, PRIVILEGE
        `;
        const objPrivResult = await connectionManager.query(objPrivSql);

        console.log(chalk.cyan('\n对象权限:'));
        if (objPrivResult.rows && objPrivResult.rows.length > 0) {
          printTable(['所有者', '对象', '权限', '可转授'], objPrivResult.rows);
        } else {
          console.log(chalk.gray('  无'));
        }

        // 查询角色
        const roleSql = `
          SELECT
            GRANTED_ROLE AS "角色",
            ADMIN_OPTION AS "可转授",
            DEFAULT_ROLE AS "默认角色"
          FROM DBA_ROLE_PRIVS
          WHERE GRANTEE = '${name.toUpperCase()}'
          ORDER BY GRANTED_ROLE
        `;
        const roleResult = await connectionManager.query(roleSql);

        console.log(chalk.cyan('\n角色:'));
        if (roleResult.rows && roleResult.rows.length > 0) {
          printTable(['角色', '可转授', '默认角色'], roleResult.rows);
        } else {
          console.log(chalk.gray('  无'));
        }

        // 查询表空间配额
        const quotaSql = `
          SELECT
            TABLESPACE_NAME AS "表空间",
            BYTES AS "已用字节",
            MAX_BYTES AS "最大字节"
          FROM DBA_TS_QUOTAS
          WHERE USERNAME = '${name.toUpperCase()}'
          ORDER BY TABLESPACE_NAME
        `;
        const quotaResult = await connectionManager.query(quotaSql);

        console.log(chalk.cyan('\n表空间配额:'));
        if (quotaResult.rows && quotaResult.rows.length > 0) {
          printTable(['表空间', '已用字节', '最大字节'], quotaResult.rows);
        } else {
          console.log(chalk.gray('  无限制'));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
        process.exit(1);
      }
    });

  return cmd;
}
