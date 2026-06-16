/**
 * 迁移命令
 *
 * 功能:
 * - migrate check - 迁移前兼容性检查
 * - migrate schema - Schema 迁移
 * - migrate data - 数据迁移
 * - migrate full - 全量迁移
 * - migrate export - 导出为 dmp 文件
 * - migrate import - 从 dmp 文件导入
 * - migrate convert-sql - SQL 语法转换
 * - migrate diff - 结构差异对比
 * - migrate wizard - 交互式迁移向导
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, select, confirm } from '@inquirer/prompts';
import type { ConfigManager } from '../lib/config-manager';
import type { ConnectionManager } from '../lib/connection-manager';
import {
  DexpWrapper,
  DimpWrapper,
  SqlConverter,
  createMigrationChecker,
  type DatabaseType,
  type ReportFormat,
  type TableInfo,
} from '../lib/migration';

/**
 * 创建迁移命令
 */
export function migrateCommand(
  configManager: ConfigManager,
  connectionManager: ConnectionManager
): Command {
  const cmd = new Command('migrate').alias('mig').description('数据库迁移');

  // check - 迁移前兼容性检查
  cmd
    .command('check')
    .description('迁移前兼容性检查')
    .option('-s, --source-type <type>', '源数据库类型 (oracle/mysql)', 'oracle')
    .option('-r, --report <format>', '报告格式 (text/json/html/markdown)', 'text')
    .option('-o, --output <file>', '输出文件路径')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .action(async (options) => {
      const spinner = ora('正在执行兼容性检查...').start();

      try {
        const sourceType = options.sourceType as DatabaseType;
        const checker = createMigrationChecker(sourceType);
        const reportFormat = options.report as ReportFormat;

        // 从数据库获取表结构信息
        const schema = options.schema || 'SYSDBA';
        const tableNames = options.tables ? options.tables.split(',') : [];

        // 查询表结构
        let tablesSql = `
          SELECT TABLE_NAME
          FROM ALL_TABLES
          WHERE OWNER = '${schema.toUpperCase()}'
        `;
        if (tableNames.length > 0) {
          const tableList = tableNames.map((t: string) => `'${t.toUpperCase()}'`).join(',');
          tablesSql += ` AND TABLE_NAME IN (${tableList})`;
        }

        const tablesResult = await connectionManager.query(tablesSql);
        const tables: TableInfo[] = [];

        for (const row of tablesResult.rows || []) {
          const tableName = row.TABLE_NAME;
          const columnsSql = `
            SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
            FROM ALL_TAB_COLUMNS
            WHERE OWNER = '${schema.toUpperCase()}'
              AND TABLE_NAME = '${tableName}'
            ORDER BY COLUMN_ID
          `;
          const columnsResult = await connectionManager.query(columnsSql);

          tables.push({
            name: tableName,
            schema,
            columns: (columnsResult.rows || []).map((col: Record<string, unknown>) => ({
              name: col.COLUMN_NAME,
              dataType: col.DATA_TYPE,
              typeParams: col.DATA_LENGTH ? String(col.DATA_LENGTH) : undefined,
              nullable: col.NULLABLE === 'Y',
              defaultValue: col.DATA_DEFAULT || undefined,
            })),
          });
        }

        const result = await checker.checkCompatibility(tables);

        spinner.succeed('兼容性检查完成');

        // 输出结果
        if (options.output) {
          const fs = await import('fs');
          const report = checker.generateReport(result, reportFormat);
          fs.writeFileSync(options.output, report, 'utf-8');
          console.log(chalk.green(`\n报告已保存至: ${options.output}`));
        } else {
          const report = checker.generateReport(result, reportFormat);
          console.log('\n' + report);
        }

        // 显示摘要
        console.log(chalk.cyan('\n检查摘要:'));
        console.log(`  总问题数: ${result.issues.length}`);
        console.log(`  ${chalk.red('错误:')} ${result.issues.filter((i) => i.severity === 'error').length}`);
        console.log(`  ${chalk.yellow('警告:')} ${result.issues.filter((i) => i.severity === 'warning').length}`);
        console.log(`  ${chalk.blue('信息:')} ${result.issues.filter((i) => i.severity === 'info').length}`);
      } catch (error: unknown) {
        spinner.fail(chalk.red('兼容性检查失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // schema - Schema 迁移
  cmd
    .command('schema')
    .description('Schema 迁移')
    .option('-s, --source <connection>', '源数据库连接字符串')
    .option('-t, --target <connection>', '目标数据库连接字符串')
    .option('--source-type <type>', '源数据库类型 (oracle/mysql)', 'oracle')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('--dry-run', '仅生成 SQL 不执行', false)
    .option('-o, --output <file>', '输出 SQL 文件路径')
    .action(async (options) => {
      const spinner = ora('正在执行 Schema 迁移...').start();

      try {
        // 获取源数据库结构
        const sourceType = options.sourceType as DatabaseType;
        const checker = createMigrationChecker(sourceType);
        const schema = options.schema || 'SYSDBA';

        // 查询表结构
        let tablesSql = `
          SELECT TABLE_NAME
          FROM ALL_TABLES
          WHERE OWNER = '${schema.toUpperCase()}'
        `;
        if (options.tables) {
          const tableList = options.tables.split(',').map((t: string) => `'${t.toUpperCase()}'`).join(',');
          tablesSql += ` AND TABLE_NAME IN (${tableList})`;
        }

        const tablesResult = await connectionManager.query(tablesSql);
        const tables: TableInfo[] = [];

        for (const row of tablesResult.rows || []) {
          const tableName = row.TABLE_NAME;
          const columnsSql = `
            SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
            FROM ALL_TAB_COLUMNS
            WHERE OWNER = '${schema.toUpperCase()}'
              AND TABLE_NAME = '${tableName}'
            ORDER BY COLUMN_ID
          `;
          const columnsResult = await connectionManager.query(columnsSql);

          tables.push({
            name: tableName,
            schema,
            columns: (columnsResult.rows || []).map((col: Record<string, unknown>) => ({
              name: col.COLUMN_NAME,
              dataType: col.DATA_TYPE,
              typeParams: col.DATA_LENGTH ? String(col.DATA_LENGTH) : undefined,
              nullable: col.NULLABLE === 'Y',
              defaultValue: col.DATA_DEFAULT || undefined,
            })),
          });
        }

        const checkResult = await checker.checkCompatibility(tables);

        if (checkResult.issues.some((i) => i.severity === 'error')) {
          spinner.warn(chalk.yellow('检测到严重兼容性问题'));
          const proceed = await confirm({
            message: '是否继续迁移?',
            default: false,
          });
          if (!proceed) {
            console.log(chalk.yellow('迁移已取消'));
            return;
          }
        }

        // TODO: 实现 Schema 迁移逻辑
        spinner.succeed('Schema 迁移完成');
        console.log(chalk.green('\nSchema 迁移功能开发中...'));
      } catch (error: unknown) {
        spinner.fail(chalk.red('Schema 迁移失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // data - 数据迁移
  cmd
    .command('data')
    .description('数据迁移')
    .option('-s, --source <connection>', '源数据库连接字符串')
    .option('-t, --target <connection>', '目标数据库连接字符串')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('--batch-size <size>', '批次大小', '10000')
    .option('--parallel <n>', '并行数', '4')
    .option('--skip-errors', '跳过错误继续', false)
    .action(async (options) => {
      const spinner = ora('正在执行数据迁移...').start();

      try {
        // TODO: 实现数据迁移逻辑
        spinner.succeed('数据迁移完成');
        console.log(chalk.green('\n数据迁移功能开发中...'));
      } catch (error: unknown) {
        spinner.fail(chalk.red('数据迁移失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // full - 全量迁移
  cmd
    .command('full')
    .description('全量迁移（Schema + 数据）')
    .option('-s, --source <connection>', '源数据库连接字符串')
    .option('-t, --target <connection>', '目标数据库连接字符串')
    .option('--source-type <type>', '源数据库类型 (oracle/mysql)', 'oracle')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('--batch-size <size>', '批次大小', '10000')
    .option('--parallel <n>', '并行数', '4')
    .option('--skip-check', '跳过兼容性检查', false)
    .action(async (options) => {
      const spinner = ora('正在执行全量迁移...').start();

      try {
        // 兼容性检查
        if (!options.skipCheck) {
          spinner.text = '正在执行兼容性检查...';
          const sourceType = options.sourceType as DatabaseType;
          const checker = createMigrationChecker(sourceType);
          const schema = options.schema || 'SYSDBA';

          // 查询表结构
          let tablesSql = `
            SELECT TABLE_NAME
            FROM ALL_TABLES
            WHERE OWNER = '${schema.toUpperCase()}'
          `;
          if (options.tables) {
            const tableList = options.tables.split(',').map((t: string) => `'${t.toUpperCase()}'`).join(',');
            tablesSql += ` AND TABLE_NAME IN (${tableList})`;
          }

          const tablesResult = await connectionManager.query(tablesSql);
          const tables: TableInfo[] = [];

          for (const row of tablesResult.rows || []) {
            const tableName = row.TABLE_NAME;
            const columnsSql = `
              SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
              FROM ALL_TAB_COLUMNS
              WHERE OWNER = '${schema.toUpperCase()}'
                AND TABLE_NAME = '${tableName}'
              ORDER BY COLUMN_ID
            `;
            const columnsResult = await connectionManager.query(columnsSql);

            tables.push({
              name: tableName,
              schema,
              columns: (columnsResult.rows || []).map((col: Record<string, unknown>) => ({
                name: col.COLUMN_NAME,
                dataType: col.DATA_TYPE,
                typeParams: col.DATA_LENGTH ? String(col.DATA_LENGTH) : undefined,
                nullable: col.NULLABLE === 'Y',
                defaultValue: col.DATA_DEFAULT || undefined,
              })),
            });
          }

          const checkResult = await checker.checkCompatibility(tables);

          if (checkResult.issues.some((i) => i.severity === 'error')) {
            spinner.warn(chalk.yellow('检测到严重兼容性问题'));
            const proceed = await confirm({
              message: '是否继续迁移?',
              default: false,
            });
            if (!proceed) {
              console.log(chalk.yellow('迁移已取消'));
              return;
            }
          }
        }

        // TODO: 实现 Schema 迁移
        spinner.text = '正在迁移 Schema...';

        // TODO: 实现数据迁移
        spinner.text = '正在迁移数据...';

        spinner.succeed('全量迁移完成');
        console.log(chalk.green('\n全量迁移功能开发中...'));
      } catch (error: unknown) {
        spinner.fail(chalk.red('全量迁移失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // export - 导出为 dmp 文件
  cmd
    .command('export')
    .description('导出为 dmp 文件')
    .option('-o, --output <file>', '输出文件路径')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('--compress', '启用压缩', false)
    .option('--parallel <n>', '并行数', '4')
    .option('--log-file <file>', '日志文件路径')
    .action(async (options) => {
      const spinner = ora('正在导出数据...').start();

      try {
        const dexp = new DexpWrapper();

        // 构建连接字符串
        const connConfig = connectionManager.getCurrentConfig();
        if (!connConfig) {
          throw new Error('没有活动的连接，请先连接数据库');
        }
        const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

        const outputFile = options.output || `export_${Date.now()}.dmp`;

        const result = await dexp.export({
          userid,
          file: outputFile,
          schemas: options.schema ? [options.schema] : undefined,
          tables: options.tables ? options.tables.split(',') : undefined,
          compress: options.compress,
          log: options.logFile,
        });

        if (result.success) {
          spinner.succeed(chalk.green('导出完成'));
          console.log(`\n输出文件: ${outputFile}`);
          console.log(`\n${result.stdout}`);
        } else {
          spinner.fail(chalk.red('导出失败'));
        }
      } catch (error: unknown) {
        spinner.fail(chalk.red('导出失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // import - 从 dmp 文件导入
  cmd
    .command('import')
    .description('从 dmp 文件导入')
    .option('-i, --input <file>', '输入文件路径')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('--ignore-errors', '忽略错误继续', false)
    .option('--parallel <n>', '并行数', '4')
    .option('--log-file <file>', '日志文件路径')
    .option('--table-exists <action>', '表已存在时的处理 (skip/replace/truncate)', 'skip')
    .action(async (options) => {
      const spinner = ora('正在导入数据...').start();

      try {
        const dimp = new DimpWrapper();

        // 构建连接字符串
        const connConfig = connectionManager.getCurrentConfig();
        if (!connConfig) {
          throw new Error('没有活动的连接，请先连接数据库');
        }
        const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

        const result = await dimp.import({
          userid,
          file: options.input,
          schemas: options.schema ? [options.schema] : undefined,
          tables: options.tables ? options.tables.split(',') : undefined,
          ignore: options.ignoreErrors,
          log: options.logFile,
          tableExistsAction: options.tableExists.toUpperCase() as 'SKIP' | 'APPEND' | 'TRUNCATE' | 'REPLACE',
        });

        if (result.success) {
          spinner.succeed(chalk.green('导入完成'));
          console.log(`\n${result.stdout}`);
        } else {
          spinner.fail(chalk.red('导入失败'));
        }
      } catch (error: unknown) {
        spinner.fail(chalk.red('导入失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // convert-sql - SQL 语法转换
  cmd
    .command('convert-sql')
    .description('SQL 语法转换')
    .option('-s, --source <type>', '源数据库类型 (oracle/mysql)', 'oracle')
    .option('-i, --input <file>', '输入 SQL 文件路径')
    .option('-o, --output <file>', '输出文件路径')
    .option('--sql <sql>', '直接转换 SQL 语句')
    .option('--dir <directory>', '批量转换目录')
    .option('--pattern <pattern>', '文件匹配模式', '*.sql')
    .action(async (options) => {
      try {
        const sourceType = options.source as DatabaseType;
        const converter = new SqlConverter({ from: sourceType });

        if (options.sql) {
          // 单条 SQL 转换
          const spinner = ora('正在转换 SQL...').start();
          const result = converter.convert(options.sql);
          spinner.succeed('转换完成');

          console.log(chalk.cyan('\n原始 SQL:'));
          console.log(chalk.gray(options.sql));
          console.log(chalk.cyan('\n转换后 SQL:'));
          console.log(chalk.green(result.converted));

          if (result.appliedRules.length > 0) {
            console.log(chalk.cyan('\n应用的规则:'));
            result.appliedRules.forEach((rule) => {
              console.log(`  - ${rule}`);
            });
          }
        } else if (options.dir) {
          // 批量转换目录
          const spinner = ora('正在批量转换 SQL...').start();
          const batchResult = await converter.convertDirectory(options.dir);
          spinner.succeed('批量转换完成');

          console.log(chalk.cyan('\n转换摘要:'));
          console.log(`  文件数: ${batchResult.totalFiles}`);
          console.log(`  ${chalk.green('成功:')} ${batchResult.successCount}`);
          console.log(`  ${chalk.red('失败:')} ${batchResult.failureCount}`);
        } else if (options.input) {
          // 单文件转换
          const spinner = ora('正在转换 SQL 文件...').start();
          const result = await converter.convertFile(options.input);
          spinner.succeed('转换完成');

          console.log(chalk.cyan('\n转换摘要:'));
          console.log(`  源文件: ${result.sourceFile}`);
          console.log(`  目标文件: ${result.targetFile}`);
          console.log(`  应用规则数: ${result.result.appliedRules.length}`);

          if (result.success) {
            console.log(chalk.green('\n转换成功'));
          } else {
            console.log(chalk.red(`\n转换失败: ${result.error}`));
          }
        } else {
          console.log(chalk.yellow('请指定 --sql、--input 或 --dir'));
        }
      } catch (error: unknown) {
        console.error(chalk.red('SQL 转换失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // diff - 结构差异对比
  cmd
    .command('diff')
    .description('结构差异对比')
    .option('-s, --source <connection>', '源数据库连接字符串')
    .option('-t, --target <connection>', '目标数据库连接字符串')
    .option('--schema <schema>', '指定 Schema')
    .option('--tables <tables>', '指定表（逗号分隔）')
    .option('-o, --output <file>', '输出文件路径')
    .option('-f, --format <format>', '输出格式 (text/json/html)', 'text')
    .action(async (options) => {
      const spinner = ora('正在对比结构差异...').start();

      try {
        // TODO: 实现结构差异对比逻辑
        spinner.succeed('结构差异对比完成');
        console.log(chalk.green('\n结构差异对比功能开发中...'));
      } catch (error: unknown) {
        spinner.fail(chalk.red('结构差异对比失败'));
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  // wizard - 交互式迁移向导
  cmd
    .command('wizard')
    .description('交互式迁移向导')
    .action(async () => {
      console.log(chalk.cyan('\n=== 数据库迁移向导 ===\n'));

      try {
        // 选择迁移类型
        const migrationType = await select({
          message: '请选择迁移类型:',
          choices: [
            { name: '兼容性检查', value: 'check' },
            { name: 'Schema 迁移', value: 'schema' },
            { name: '数据迁移', value: 'data' },
            { name: '全量迁移', value: 'full' },
            { name: '导出 dmp 文件', value: 'export' },
            { name: '导入 dmp 文件', value: 'import' },
            { name: 'SQL 语法转换', value: 'convert-sql' },
            { name: '结构差异对比', value: 'diff' },
          ],
        });

        // 选择源数据库类型
        const sourceType = await select({
          message: '请选择源数据库类型:',
          choices: [
            { name: 'Oracle', value: 'oracle' },
            { name: 'MySQL', value: 'mysql' },
          ],
        });

        // 输入 Schema
        const schema = await input({
          message: '请输入 Schema (可选):',
        });

        // 输入表名
        const tables = await input({
          message: '请输入表名（逗号分隔，留空表示全部）:',
        });

        // 根据迁移类型执行
        const spinner = ora('正在执行迁移...').start();

        switch (migrationType) {
          case 'check': {
            const checker = createMigrationChecker(sourceType as DatabaseType);
            const schemaName = schema || 'SYSDBA';

            // 查询表结构
            let tablesSql = `
              SELECT TABLE_NAME
              FROM ALL_TABLES
              WHERE OWNER = '${schemaName.toUpperCase()}'
            `;
            if (tables) {
              const tableList = tables.split(',').map((t: string) => `'${t.toUpperCase()}'`).join(',');
              tablesSql += ` AND TABLE_NAME IN (${tableList})`;
            }

            const tablesResult = await connectionManager.query(tablesSql);
            const tableInfos: TableInfo[] = [];

            for (const row of tablesResult.rows || []) {
              const tableName = row.TABLE_NAME;
              const columnsSql = `
                SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
                FROM ALL_TAB_COLUMNS
                WHERE OWNER = '${schemaName.toUpperCase()}'
                  AND TABLE_NAME = '${tableName}'
                ORDER BY COLUMN_ID
              `;
              const columnsResult = await connectionManager.query(columnsSql);

              tableInfos.push({
                name: tableName,
                schema: schemaName,
                columns: (columnsResult.rows || []).map((col: Record<string, unknown>) => ({
                  name: col.COLUMN_NAME,
                  dataType: col.DATA_TYPE,
                  typeParams: col.DATA_LENGTH ? String(col.DATA_LENGTH) : undefined,
                  nullable: col.NULLABLE === 'Y',
                  defaultValue: col.DATA_DEFAULT || undefined,
                })),
              });
            }

            const result = await checker.checkCompatibility(tableInfos);
            spinner.succeed('兼容性检查完成');
            const report = checker.generateReport(result, 'text');
            console.log('\n' + report);
            break;
          }
          case 'export': {
            const outputPath = await input({
              message: '请输入输出文件路径:',
              default: `export_${Date.now()}.dmp`,
            });
            const dexp = new DexpWrapper();
            const connConfig = connectionManager.getCurrentConfig();
            if (!connConfig) {
              throw new Error('没有活动的连接，请先连接数据库');
            }
            const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

            const result = await dexp.export({
              userid,
              file: outputPath,
              schemas: schema ? [schema] : undefined,
              tables: tables ? tables.split(',') : undefined,
            });
            if (result.success) {
              spinner.succeed('导出完成');
              console.log(`输出文件: ${outputPath}`);
            } else {
              spinner.fail('导出失败');
            }
            break;
          }
          case 'import': {
            const inputPath = await input({
              message: '请输入输入文件路径:',
            });
            const dimp = new DimpWrapper();
            const connConfig = connectionManager.getCurrentConfig();
            if (!connConfig) {
              throw new Error('没有活动的连接，请先连接数据库');
            }
            const userid = `${connConfig.user}/${connConfig.password}@${connConfig.host}:${connConfig.port}`;

            const result = await dimp.import({
              userid,
              file: inputPath,
              schemas: schema ? [schema] : undefined,
              tables: tables ? tables.split(',') : undefined,
            });
            if (result.success) {
              spinner.succeed('导入完成');
            } else {
              spinner.fail('导入失败');
            }
            break;
          }
          case 'convert-sql': {
            const sqlInput = await input({
              message: '请输入 SQL 语句:',
            });
            const converter = new SqlConverter(sourceType as DatabaseType);
            const result = converter.convert(sqlInput);
            spinner.succeed('转换完成');
            console.log(chalk.cyan('\n转换后 SQL:'));
            console.log(chalk.green(result.converted));
            break;
          }
          default:
            spinner.info(chalk.yellow(`${migrationType} 功能开发中...`));
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'ExitPromptError') {
          console.log(chalk.yellow('\n向导已取消'));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`错误: ${message}`));
      }
    });

  return cmd;
}
