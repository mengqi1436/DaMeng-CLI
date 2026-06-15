import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';

export function maintenanceCommand(
  _configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('maintenance')
    .alias('maint')
    .description('数据库维护');

  // 表空间管理子命令
  const tsCmd = cmd.command('tablespace').alias('ts').description('表空间管理');

  tsCmd
    .command('list')
    .alias('ls')
    .description('列出表空间')
    .action(async () => {
      try {
        const result = await connectionManager.query(`
          SELECT
            TABLESPACE_NAME AS "Name",
            STATUS AS "Status",
            CONTENTS AS "Type"
          FROM DBA_TABLESPACES ORDER BY TABLESPACE_NAME
        `);
        if (result.rows && result.rows.length > 0) {
          const Table = require('cli-table3');
          const table = new Table({
            head: Object.keys(result.rows[0]).map(k => chalk.cyan(k)),
            style: { head: ['cyan'], border: ['grey'] }
          });
          result.rows.forEach((row: any) => table.push(Object.values(row)));
          console.log(table.toString());
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  tsCmd
    .command('create <name>')
    .description('创建表空间')
    .requiredOption('-s, --size <size>', '初始大小 (如 100M)')
    .option('-a, --autoextend <size>', '自动扩展大小')
    .action(async (name, options) => {
      const spinner = ora('创建表空间...').start();
      try {
        let sql = `CREATE TABLESPACE ${name} DATAFILE '${name}.dbf' SIZE ${options.size}`;
        if (options.autoextend) {
          sql += ` AUTOEXTEND ON NEXT ${options.autoextend} MAXSIZE UNLIMITED`;
        }
        await connectionManager.execute(sql);
        spinner.succeed(chalk.green(`表空间 "${name}" 创建成功`));
      } catch (error: any) {
        spinner.fail(chalk.red('创建失败'));
        console.error(chalk.red(error.message));
      }
    });

  tsCmd
    .command('usage')
    .description('表空间使用情况')
    .action(async () => {
      try {
        const result = await connectionManager.query(`
          SELECT
            a.TABLESPACE_NAME AS "Name",
            ROUND(a.BYTES / 1024 / 1024, 2) AS "Total (MB)",
            ROUND((a.BYTES - NVL(b.BYTES, 0)) / 1024 / 1024, 2) AS "Used (MB)",
            ROUND(((a.BYTES - NVL(b.BYTES, 0)) / a.BYTES) * 100, 2) AS "Used %"
          FROM (
            SELECT TABLESPACE_NAME, SUM(BYTES) BYTES FROM DBA_DATA_FILES GROUP BY TABLESPACE_NAME
          ) a
          LEFT JOIN (
            SELECT TABLESPACE_NAME, SUM(BYTES) BYTES FROM DBA_FREE_SPACE GROUP BY TABLESPACE_NAME
          ) b ON a.TABLESPACE_NAME = b.TABLESPACE_NAME
          ORDER BY "Used %" DESC
        `);
        if (result.rows && result.rows.length > 0) {
          const Table = require('cli-table3');
          const table = new Table({
            head: Object.keys(result.rows[0]).map(k => chalk.cyan(k)),
            style: { head: ['cyan'], border: ['grey'] }
          });
          result.rows.forEach((row: any) => table.push(Object.values(row)));
          console.log(table.toString());
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  // 日志管理子命令
  const logCmd = cmd.command('log').description('日志管理');

  logCmd
    .command('list')
    .alias('ls')
    .description('列出日志')
    .action(async () => {
      try {
        const result = await connectionManager.query(`
          SELECT
            GROUP# AS "Group",
            THREAD# AS "Thread",
            SEQUENCE# AS "Sequence",
            BYTES / 1024 / 1024 AS "Size (MB)",
            STATUS AS "Status"
          FROM V$LOG ORDER BY GROUP#
        `);
        if (result.rows && result.rows.length > 0) {
          const Table = require('cli-table3');
          const table = new Table({
            head: Object.keys(result.rows[0]).map(k => chalk.cyan(k)),
            style: { head: ['cyan'], border: ['grey'] }
          });
          result.rows.forEach((row: any) => table.push(Object.values(row)));
          console.log(table.toString());
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  logCmd
    .command('switch')
    .description('切换日志')
    .action(async () => {
      const spinner = ora('切换日志...').start();
      try {
        await connectionManager.execute('ALTER SYSTEM SWITCH LOGFILE');
        spinner.succeed(chalk.green('日志已切换'));
      } catch (error: any) {
        spinner.fail(chalk.red('切换失败'));
        console.error(chalk.red(error.message));
      }
    });

  // 统计信息更新
  cmd
    .command('analyze <table>')
    .description('更新统计信息')
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (table, options) => {
      const schema = options.schema || 'SYSDBA';
      const spinner = ora('更新统计信息...').start();
      try {
        await connectionManager.execute(`
          BEGIN
            DBMS_STATS.GATHER_TABLE_STATS(
              ownname => '${schema.toUpperCase()}',
              tabname => '${table.toUpperCase()}',
              cascade => TRUE
            );
          END;
        `);
        spinner.succeed(chalk.green(`表 "${table}" 统计信息已更新`));
      } catch (error: any) {
        spinner.fail(chalk.red('更新失败'));
        console.error(chalk.red(error.message));
      }
    });

  return cmd;
}
