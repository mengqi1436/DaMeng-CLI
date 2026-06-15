/**
 * Schema 管理命令
 *
 * 功能:
 * - schema list - 列出所有 Schema
 * - schema create <name> - 创建 Schema
 * - schema drop <name> - 删除 Schema
 * - schema use <name> - 切换 Schema
 * - schema objects <name> - 查看 Schema 对象
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, confirm } from '@inquirer/prompts';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import { executeAndDisplay } from '../lib/formatter';

/**
 * 创建 Schema 管理命令
 */
export function schemaCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('schema').description('Schema 管理');

  // 列出 Schema
  cmd
    .command('list')
    .alias('ls')
    .description('列出所有 Schema')
    .option('--user <user>', '显示指定用户的 Schema')
    .action(async (options) => {
      try {
        const userFilter = options.user
          ? `WHERE USERNAME = '${options.user.toUpperCase()}'`
          : '';

        const sql = `
          SELECT
            USERNAME AS "Owner",
            DEFAULT_TABLESPACE AS "Default Tablespace",
            CREATED AS "Created"
          FROM DBA_USERS
          ${userFilter}
          ORDER BY USERNAME
        `;
        await executeAndDisplay(connectionManager, sql);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 创建 Schema
  cmd
    .command('create <name>')
    .description('创建 Schema (用户)')
    .option('--password <password>', '用户密码')
    .option('--tablespace <ts>', '默认表空间')
    .action(async (name: string, options) => {
      const spinner = ora('创建 Schema...').start();

      try {
        // 如果没有指定密码，交互式输入
        let password = options.password;
        if (!password) {
          spinner.stop();
          password = await input({
            message: `请输入 ${name} 的密码:`,
            validate: (v: string) => v.length > 0 || '密码不能为空',
          });
        }

        let sql = `CREATE USER ${name} IDENTIFIED BY "${password}"`;
        if (options.tablespace) {
          sql += ` DEFAULT TABLESPACE ${options.tablespace}`;
        }

        await connectionManager.execute(sql);

        // 授予基本连接权限
        await connectionManager.execute(`GRANT CREATE SESSION TO ${name}`);

        spinner.succeed(chalk.green(`Schema "${name}" 创建成功`));
      } catch (error: unknown) {
        spinner.fail(chalk.red('创建失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(message));
      }
    });

  // 删除 Schema
  cmd
    .command('drop <name>')
    .description('删除 Schema')
    .option('--cascade', '级联删除所有对象', false)
    .option('--force', '跳过确认', false)
    .action(async (name: string, options) => {
      try {
        if (!options.force) {
          const confirmed = await confirm({
            message: `确认删除 Schema "${name}"? ${options.cascade ? '(包含所有对象)' : ''}`,
            default: false,
          });
          if (!confirmed) return;
        }

        const spinner = ora('删除 Schema...').start();

        try {
          const sql = `DROP USER ${name} ${options.cascade ? 'CASCADE' : ''}`;
          await connectionManager.execute(sql);
          spinner.succeed(chalk.green(`Schema "${name}" 已删除`));
        } catch (error: unknown) {
          spinner.fail(chalk.red('删除失败'));
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(chalk.red(message));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // 切换 Schema
  cmd
    .command('use <name>')
    .description('切换当前 Schema')
    .action(async (name: string) => {
      try {
        await connectionManager.execute(`SET SCHEMA ${name}`);
        console.log(chalk.green(`已切换到 Schema "${name}"`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(message));
      }
    });

  // 查看 Schema 对象
  cmd
    .command('objects <name>')
    .description('查看 Schema 下的对象')
    .option(
      '--type <type>',
      '对象类型 (table|view|sequence|procedure|all)',
      'all'
    )
    .action(async (name: string, options) => {
      try {
        const typeFilter =
          options.type === 'all'
            ? ''
            : `AND OBJECT_TYPE = '${options.type.toUpperCase()}'`;

        const sql = `
          SELECT
            OBJECT_TYPE AS "Type",
            OBJECT_NAME AS "Name",
            CREATED AS "Created",
            STATUS AS "Status"
          FROM ALL_OBJECTS
          WHERE OWNER = '${name.toUpperCase()}'
          ${typeFilter}
          ORDER BY OBJECT_TYPE, OBJECT_NAME
        `;
        await executeAndDisplay(connectionManager, sql);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  return cmd;
}
