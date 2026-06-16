/**
 * dimp 导入工具封装
 *
 * 封装达梦数据库官方 dimp 命令行工具，提供：
 * - 自动查找 dimp 可执行文件路径
 * - 异步执行导入任务
 * - 进度回调支持
 * - 命令行参数自动构建
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * 表已存在时的处理方式
 */
export type TableExistsAction = 'SKIP' | 'APPEND' | 'TRUNCATE' | 'REPLACE';

/**
 * dimp 导入选项
 */
export interface DimpOptions {
  /** 用户/密码@主机:端口 */
  userid: string;
  /** 导入文件名 */
  file: string;
  /** 日志文件路径 */
  log?: string;
  /** 全库导入 */
  full?: boolean;
  /** 按模式导入 */
  schemas?: string[];
  /** 按表导入 */
  tables?: string[];
  /** 是否导入数据行，默认 true */
  rows?: boolean;
  /** 忽略创建错误 */
  ignore?: boolean;
  /** 表已存在时的处理方式 */
  tableExistsAction?: TableExistsAction;
  /** 每多少行提交一次 */
  commitRows?: number;
}

/**
 * 进度信息
 */
export interface DimpProgress {
  /** 当前阶段 */
  stage: string;
  /** 当前处理的对象 */
  current?: string;
  /** 已完成数量 */
  completed?: number;
  /** 总数量 */
  total?: number;
  /** 原始输出行 */
  raw: string;
}

/**
 * 进度回调函数类型
 */
export type DimpProgressCallback = (progress: DimpProgress) => void;

/**
 * dimp 执行结果
 */
export interface DimpResult {
  /** 是否成功 */
  success: boolean;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
}

/**
 * dimp 导入工具封装类
 */
export class DimpWrapper {
  /** dimp 可执行文件路径 */
  private dimpPath: string;

  constructor(dimpPath?: string) {
    this.dimpPath = dimpPath || DimpWrapper.findDimpPath();
  }

  /**
   * 自动查找 dimp 可执行文件路径
   *
   * 查找顺序：
   * 1. 环境变量 DM_HOME/bin/dimp
   * 2. 常见安装路径
   * 3. 系统 PATH 中的 dimp
   */
  static findDimpPath(): string {
    // 1. 从环境变量 DM_HOME 查找
    const dmHome = process.env.DM_HOME;
    if (dmHome) {
      const dimpPath = join(dmHome, 'bin', process.platform === 'win32' ? 'dimp.exe' : 'dimp');
      if (existsSync(dimpPath)) {
        return dimpPath;
      }
    }

    // 2. 常见安装路径
    const commonPaths = process.platform === 'win32'
      ? [
          'C:\\dmdbms\\bin\\dimp.exe',
          'C:\\Program Files\\dmdbms\\bin\\dimp.exe',
          'D:\\dmdbms\\bin\\dimp.exe',
        ]
      : [
          '/opt/dmdbms/bin/dimp',
          '/usr/local/dmdbms/bin/dimp',
          '/home/dmdbms/bin/dimp',
        ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // 3. 返回默认名称，依赖系统 PATH
    return process.platform === 'win32' ? 'dimp.exe' : 'dimp';
  }

  /**
   * 执行 dimp 导入
   *
   * @param options - 导入选项
   * @param onProgress - 进度回调（可选）
   * @returns 执行结果
   */
  async import(options: DimpOptions, onProgress?: DimpProgressCallback): Promise<DimpResult> {
    const args = this.buildArgs(options);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.dimpPath, args, {
        stdio: 'pipe',
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;

        // 解析并回调进度信息
        if (onProgress) {
          const progress = this.parseProgress(text);
          if (progress) {
            onProgress(progress);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(new Error(`启动 dimp 失败: ${error.message}`));
      });

      proc.on('close', (code) => {
        const exitCode = code ?? -1;
        if (exitCode === 0) {
          resolve({
            success: true,
            stdout,
            stderr,
            exitCode,
          });
        } else {
          reject(new Error(`dimp 执行失败 (退出码: ${exitCode}): ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * 构建 dimp 命令行参数
   *
   * @param options - 导入选项
   * @returns 参数数组
   */
  buildArgs(options: DimpOptions): string[] {
    const args: string[] = [];

    // USERID（必需）
    args.push(`USERID=${options.userid}`);

    // FILE（必需）
    args.push(`FILE=${options.file}`);

    // LOG（可选）
    if (options.log) {
      args.push(`LOG=${options.log}`);
    }

    // 导入模式（互斥，优先级：full > schemas > tables）
    if (options.full) {
      args.push('FULL=Y');
    } else if (options.schemas?.length) {
      args.push(`SCHEMAS=${options.schemas.join(',')}`);
    } else if (options.tables?.length) {
      args.push(`TABLES=${options.tables.join(',')}`);
    }

    // 是否导入数据行（默认导入）
    if (options.rows === false) {
      args.push('ROWS=N');
    }

    // 忽略创建错误
    if (options.ignore) {
      args.push('IGNORE=Y');
    }

    // 表已存在时的处理方式
    if (options.tableExistsAction) {
      args.push(`TABLE_EXISTS_ACTION=${options.tableExistsAction}`);
    }

    // 每多少行提交一次
    if (options.commitRows !== undefined && options.commitRows > 0) {
      args.push(`COMMIT_ROWS=${options.commitRows}`);
    }

    return args;
  }

  /**
   * 解析 dimp 输出的进度信息
   *
   * dimp 输出示例：
   * - "正在导入表: USER_INFO"
   * - "导入表 USER_INFO 完成，共 1000 行"
   * - "正在导入模式: SYSDBA"
   * - "导入完成，共导入 5 个表"
   *
   * @param output - 原始输出文本
   * @returns 解析后的进度信息，无法解析时返回 null
   */
  parseProgress(output: string): DimpProgress | null {
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // 匹配 "正在导入表: xxx"
      const tableMatch = line.match(/正在导入表[：:]\s*(.+)/);
      if (tableMatch) {
        return {
          stage: 'importing_table',
          current: tableMatch[1].trim(),
          raw: line,
        };
      }

      // 匹配 "导入表 xxx 完成，共 N 行"
      const tableDoneMatch = line.match(/导入表\s+(.+?)\s+完成.*?共\s*(\d+)\s*行/);
      if (tableDoneMatch) {
        return {
          stage: 'table_done',
          current: tableDoneMatch[1].trim(),
          completed: parseInt(tableDoneMatch[2], 10),
          raw: line,
        };
      }

      // 匹配 "正在导入模式: xxx"
      const schemaMatch = line.match(/正在导入模式[：:]\s*(.+)/);
      if (schemaMatch) {
        return {
          stage: 'importing_schema',
          current: schemaMatch[1].trim(),
          raw: line,
        };
      }

      // 匹配 "导入完成，共导入 N 个表"
      const doneMatch = line.match(/导入完成.*?共导入\s*(\d+)\s*个表/);
      if (doneMatch) {
        return {
          stage: 'import_done',
          completed: parseInt(doneMatch[1], 10),
          raw: line,
        };
      }

      // 匹配包含进度百分比的信息
      const percentMatch = line.match(/(\d+)%/);
      if (percentMatch) {
        return {
          stage: 'progress',
          completed: parseInt(percentMatch[1], 10),
          total: 100,
          raw: line,
        };
      }
    }

    return null;
  }
}
