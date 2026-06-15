import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../lib/config-manager';
import { ConnectionManager } from '../lib/connection-manager';

export function performanceCommand(
  _configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('performance')
    .alias('perf')
    .description('性能分析');

  // 执行计划
  cmd
    .command('explain <sql>')
    .description('显示执行计划')
    .option('-f, --format <format>', '输出格式 (text|json)', 'text')
    .action(async (sql, _options) => {
      const spinner = ora('分析执行计划...').start();
      try {
        await connectionManager.execute(`EXPLAIN PLAN FOR ${sql}`);
        const result = await connectionManager.query(`
          SELECT
            OPERATION AS "Operation",
            OPTIONS AS "Options",
            OBJECT_NAME AS "Object",
            CARDINALITY AS "Rows",
            COST AS "Cost"
          FROM PLAN_TABLE ORDER BY ID
        `);
        spinner.stop();
        console.log(chalk.cyan('\n执行计划:'));
        if (result.rows && result.rows.length > 0) {
          const Table = require('cli-table3');
          const table = new Table({
            head: Object.keys(result.rows[0]).map(k => chalk.cyan(k)),
            style: { head: ['cyan'], border: ['grey'] }
          });
          result.rows.forEach((row: any) => table.push(Object.values(row)));
          console.log(table.toString());
        }
        await connectionManager.execute('DELETE FROM PLAN_TABLE').catch(() => {});
      } catch (error: any) {
        spinner.fail(chalk.red('分析失败'));
        console.error(chalk.red(error.message));
      }
    });

  // 慢查询分析
  cmd
    .command('slow')
    .description('慢查询分析')
    .option('--top <n>', '显示前 N 条', '20')
    .action(async (options) => {
      const spinner = ora('分析慢查询...').start();
      try {
        const result = await connectionManager.query(`
          SELECT
            SQL_TEXT AS "SQL",
            EXECUTIONS AS "Executions",
            ELAPSED_TIME / 1000 AS "Total Time (ms)"
          FROM V$SQL_STAT
          WHERE EXECUTIONS > 0
          ORDER BY ELAPSED_TIME DESC
          FETCH FIRST ${options.top} ROWS ONLY
        `);
        spinner.stop();
        console.log(chalk.cyan(`\n慢查询 Top ${options.top}:\n`));
        if (result.rows) {
          result.rows.forEach((row: any, i: number) => {
            console.log(chalk.yellow(`${i + 1}. ${(row.SQL || '').substring(0, 100)}...`));
            console.log(chalk.gray(`   执行次数: ${row.Executions}  总耗时: ${row['Total Time (ms)']}ms\n`));
          });
        }
      } catch (error: any) {
        spinner.fail(chalk.red('分析失败'));
        console.error(chalk.red(error.message));
      }
    });

  // 统计信息
  cmd
    .command('stats <table>')
    .description('显示统计信息')
    .option('-s, --schema <schema>', '指定 Schema')
    .action(async (table, options) => {
      const schema = options.schema || 'SYSDBA';
      console.log(chalk.cyan(`\n表 ${schema}.${table} 统计信息:\n`));
      try {
        const result = await connectionManager.query(`
          SELECT
            NUM_ROWS AS "Rows",
            BLOCKS AS "Blocks",
            AVG_ROW_LEN AS "Avg Row Length",
            LAST_ANALYZED AS "Last Analyzed"
          FROM ALL_TABLES
          WHERE OWNER = '${schema.toUpperCase()}'
            AND TABLE_NAME = '${table.toUpperCase()}'
        `);
        if (result.rows && result.rows.length > 0) {
          Object.entries(result.rows[0]).forEach(([key, value]) => {
            console.log(chalk.gray(`  ${key}: ${value}`));
          });
        } else {
          console.log(chalk.yellow('未找到表统计信息'));
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  return cmd;
}
