/**
 * 输出格式化器
 * 支持表格、JSON、CSV、TSV 格式输出
 */

import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * 输出格式类型
 */
export type OutputFormat = 'table' | 'json' | 'csv' | 'tsv';

/**
 * 格式化选项
 */
export interface FormatOptions {
  /** 输出格式 */
  format?: OutputFormat;
  /** 最大显示行数 */
  maxRows?: number;
  /** 是否显示表头 */
  showHeaders?: boolean;
  /** 是否启用颜色 */
  color?: boolean;
  /** NULL 值显示文本 */
  nullText?: string;
  /** JSON 缩进空格数 */
  jsonIndent?: number;
  /** CSV 分隔符 */
  csvDelimiter?: string;
  /** TSV 分隔符 */
  tsvDelimiter?: string;
}

/**
 * 查询结果数据
 */
export interface QueryResult {
  /** 列名列表 */
  columns: string[];
  /** 数据行 */
  rows: Record<string, any>[];
  /** 总行数（可能大于 rows.length） */
  totalRows?: number;
}

/**
 * 输出格式化器类
 */
export class Formatter {
  private options: Required<FormatOptions>;

  constructor(options: FormatOptions = {}) {
    this.options = {
      format: options.format ?? 'table',
      maxRows: options.maxRows ?? 1000,
      showHeaders: options.showHeaders ?? true,
      color: options.color ?? true,
      nullText: options.nullText ?? 'NULL',
      jsonIndent: options.jsonIndent ?? 2,
      csvDelimiter: options.csvDelimiter ?? ',',
      tsvDelimiter: options.tsvDelimiter ?? '\t',
    };
  }

  /**
   * 格式化输出查询结果
   */
  format(result: QueryResult): string {
    const { columns, rows } = result;

    // 限制显示行数
    const displayRows = rows.slice(0, this.options.maxRows);

    switch (this.options.format) {
      case 'json':
        return this.toJson(displayRows);
      case 'csv':
        return this.toCsv(columns, displayRows);
      case 'tsv':
        return this.toTsv(columns, displayRows);
      case 'table':
      default:
        return this.toTable(columns, displayRows);
    }
  }

  /**
   * 格式化为表格
   */
  toTable(columns: string[], rows: Record<string, any>[]): string {
    const { showHeaders, color, nullText } = this.options;

    // 创建表格实例（cli-table3 最佳实践）
    const table = new Table({
      head: showHeaders
        ? columns.map((col) => (color ? chalk.cyan(col) : col))
        : [],
      style: {
        head: color ? ['cyan'] : [],    // 表头颜色
        border: color ? ['grey'] : [],  // 边框颜色
      },
      // 自动换行
      wordWrap: true,
    });

    // 添加数据行
    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        // NULL 值处理
        if (val === null || val === undefined) {
          return color ? chalk.gray(nullText) : nullText;
        }
        return String(val);
      });
      table.push(values);
    }

    return table.toString();
  }

  /**
   * 格式化为 JSON
   */
  toJson(rows: Record<string, any>[]): string {
    const { jsonIndent } = this.options;
    return JSON.stringify(rows, null, jsonIndent);
  }

  /**
   * 格式化为 CSV
   */
  toCsv(columns: string[], rows: Record<string, any>[]): string {
    const { csvDelimiter, showHeaders } = this.options;
    const lines: string[] = [];

    // 添加表头
    if (showHeaders) {
      lines.push(columns.map((col) => this.escapeCsvField(col, csvDelimiter)).join(csvDelimiter));
    }

    // 添加数据行
    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        // NULL 值处理
        if (val === null || val === undefined) {
          return '';
        }
        return this.escapeCsvField(String(val), csvDelimiter);
      });
      lines.push(values.join(csvDelimiter));
    }

    return lines.join('\n');
  }

  /**
   * 格式化为 TSV
   */
  toTsv(columns: string[], rows: Record<string, any>[]): string {
    const { tsvDelimiter, showHeaders } = this.options;
    const lines: string[] = [];

    // 添加表头
    if (showHeaders) {
      lines.push(columns.join(tsvDelimiter));
    }

    // 添加数据行
    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        // NULL 值处理
        if (val === null || val === undefined) {
          return '';
        }
        // 替换制表符为空格
        return String(val).replace(/\t/g, ' ');
      });
      lines.push(values.join(tsvDelimiter));
    }

    return lines.join('\n');
  }

  /**
   * 转义 CSV 字段
   * 如果字段包含分隔符、引号或换行符，需要用引号包裹
   */
  private escapeCsvField(value: string, delimiter: string): string {
    if (
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 格式化持续时间
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * 格式化行数信息
   */
  static formatRowCount(displayed: number, total?: number): string {
    if (total !== undefined && total > displayed) {
      return `显示 ${displayed} 行，共 ${total} 行`;
    }
    return `共 ${displayed} 行`;
  }
}

/**
 * 创建格式化器实例
 */
export function createFormatter(options?: FormatOptions): Formatter {
  return new Formatter(options);
}

/**
 * 快速格式化查询结果
 */
export function formatQueryResult(
  result: QueryResult,
  options?: FormatOptions
): string {
  const formatter = createFormatter(options);
  return formatter.format(result);
}

/**
 * 执行 SQL 查询并显示结果
 *
 * @param connectionManager - 连接管理器实例
 * @param sql - SQL 查询语句
 * @param format - 输出格式（可选，默认为 'table'）
 */
export async function executeAndDisplay(
  connectionManager: { query: (sql: string) => Promise<any> },
  sql: string,
  format?: OutputFormat
): Promise<void> {
  const result = await connectionManager.query(sql);

  if (result.rows && result.rows.length > 0) {
    const columns =
      result.metaData?.map((m: any) => m.name) ||
      Object.keys(result.rows[0]);

    const formatter = createFormatter({ format: format || 'table' });
    const output = formatter.format({ columns, rows: result.rows });
    console.log(output);
    console.log(chalk.gray(`\n共 ${result.rows.length} 行`));
  } else {
    console.log(chalk.yellow('查询返回 0 行'));
  }
}
