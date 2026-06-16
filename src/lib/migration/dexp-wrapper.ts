/**
 * dexp 导出工具封装
 *
 * 封装达梦数据库官方 dexp 命令行工具，提供：
 * - 自动查找 dexp 可执行文件路径
 * - 异步执行导出任务
 * - 进度回调支持
 * - 命令行参数自动构建
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * dexp 导出选项
 */
export interface DexpOptions {
  /** 用户/密码@主机:端口 */
  userid: string;
  /** 导出文件名 */
  file: string;
  /** 日志文件路径 */
  log?: string;
  /** 全库导出 */
  full?: boolean;
  /** 按模式导出 */
  schemas?: string[];
  /** 按表导出 */
  tables?: string[];
  /** 是否导出数据行，默认 true */
  rows?: boolean;
  /** 是否压缩 */
  compress?: boolean;
  /** 按用户导出 */
  owner?: string;
}

/**
 * 进度信息
 */
export interface DexpProgress {
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
export type DexpProgressCallback = (progress: DexpProgress) => void;

/**
 * dexp 执行结果
 */
export interface DexpResult {
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
 * dexp 导出工具封装类
 */
export class DexpWrapper {
  /** dexp 可执行文件路径 */
  private dexpPath: string;

  constructor(dexpPath?: string) {
    this.dexpPath = dexpPath || DexpWrapper.findDexpPath();
  }

  /**
   * 自动查找 dexp 可执行文件路径
   *
   * 查找顺序：
   * 1. 环境变量 DM_HOME/bin/dexp
   * 2. 常见安装路径
   * 3. 系统 PATH 中的 dexp
   */
  static findDexpPath(): string {
    // 1. 从环境变量 DM_HOME 查找
    const dmHome = process.env.DM_HOME;
    if (dmHome) {
      const dexpPath = join(dmHome, 'bin', process.platform === 'win32' ? 'dexp.exe' : 'dexp');
      if (existsSync(dexpPath)) {
        return dexpPath;
      }
    }

    // 2. 常见安装路径
    const commonPaths = process.platform === 'win32'
      ? [
          'C:\\dmdbms\\bin\\dexp.exe',
          'C:\\Program Files\\dmdbms\\bin\\dexp.exe',
          'D:\\dmdbms\\bin\\dexp.exe',
        ]
      : [
          '/opt/dmdbms/bin/dexp',
          '/usr/local/dmdbms/bin/dexp',
          '/home/dmdbms/bin/dexp',
        ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // 3. 返回默认名称，依赖系统 PATH
    return process.platform === 'win32' ? 'dexp.exe' : 'dexp';
  }

  /**
   * 执行 dexp 导出
   *
   * @param options - 导出选项
   * @param onProgress - 进度回调（可选）
   * @returns 执行结果
   */
  async export(options: DexpOptions, onProgress?: DexpProgressCallback): Promise<DexpResult> {
    const args = this.buildArgs(options);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.dexpPath, args, {
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
        reject(new Error(`启动 dexp 失败: ${error.message}`));
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
          reject(new Error(`dexp 执行失败 (退出码: ${exitCode}): ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * 构建 dexp 命令行参数
   *
   * @param options - 导出选项
   * @returns 参数数组
   */
  buildArgs(options: DexpOptions): string[] {
    const args: string[] = [];

    // USERID（必需）
    args.push(`USERID=${options.userid}`);

    // FILE（必需）
    args.push(`FILE=${options.file}`);

    // LOG（可选）
    if (options.log) {
      args.push(`LOG=${options.log}`);
    }

    // 导出模式（互斥，优先级：full > schemas > tables > owner）
    if (options.full) {
      args.push('FULL=Y');
    } else if (options.schemas?.length) {
      args.push(`SCHEMAS=${options.schemas.join(',')}`);
    } else if (options.tables?.length) {
      args.push(`TABLES=${options.tables.join(',')}`);
    } else if (options.owner) {
      args.push(`OWNER=${options.owner}`);
    }

    // 是否导出数据行（默认导出）
    if (options.rows === false) {
      args.push('ROWS=N');
    }

    // 是否压缩
    if (options.compress) {
      args.push('COMPRESS=Y');
    }

    return args;
  }

  /**
   * 解析 dexp 输出的进度信息
   *
   * dexp 输出示例：
   * - "正在导出表: USER_INFO"
   * - "导出表 USER_INFO 完成，共 1000 行"
   * - "正在导出模式: SYSDBA"
   *
   * @param output - 原始输出文本
   * @returns 解析后的进度信息，无法解析时返回 null
   */
  parseProgress(output: string): DexpProgress | null {
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // 匹配 "正在导出表: xxx"
      const tableMatch = line.match(/正在导出表[：:]\s*(.+)/);
      if (tableMatch) {
        return {
          stage: 'exporting_table',
          current: tableMatch[1].trim(),
          raw: line,
        };
      }

      // 匹配 "导出表 xxx 完成，共 N 行"
      const tableDoneMatch = line.match(/导出表\s+(.+?)\s+完成.*?共\s*(\d+)\s*行/);
      if (tableDoneMatch) {
        return {
          stage: 'table_done',
          current: tableDoneMatch[1].trim(),
          completed: parseInt(tableDoneMatch[2], 10),
          raw: line,
        };
      }

      // 匹配 "正在导出模式: xxx"
      const schemaMatch = line.match(/正在导出模式[：:]\s*(.+)/);
      if (schemaMatch) {
        return {
          stage: 'exporting_schema',
          current: schemaMatch[1].trim(),
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
