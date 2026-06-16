/**
 * SQL 语法转换器
 * 支持 Oracle/MySQL → 达梦 (DM) 的 SQL 语法转换
 *
 * 功能特性：
 * - Oracle → DM 转换规则（ROWNUM、DECODE、NVL、NVL2、SYSDATE、VARCHAR2、NUMBER 等）
 * - MySQL → DM 转换规则（AUTO_INCREMENT、IFNULL、ENUM、JSON、TINYINT 等）
 * - 批量文件转换
 * - 就地修改和输出到新文件
 * - 转换统计和报告
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * 支持的数据库类型
 */
export type DatabaseType = 'oracle' | 'mysql' | 'dm';

/**
 * 转换规则类别
 */
export type RuleCategory = 'syntax' | 'function' | 'type' | 'keyword';

/**
 * 转换规则接口
 */
export interface ConversionRule {
  /** 规则唯一标识 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 规则类别 */
  category: RuleCategory;
  /** 源数据库类型 */
  source: DatabaseType;
  /** 匹配模式 */
  pattern: RegExp;
  /** 替换内容：字符串或函数 */
  replacement: string | ((match: RegExpMatchArray) => string);
  /** 示例 */
  examples: Array<{ before: string; after: string }>;
}

/**
 * 转换结果
 */
export interface ConversionResult {
  /** 原始内容 */
  original: string;
  /** 转换后内容 */
  converted: string;
  /** 应用的规则 */
  appliedRules: string[];
  /** 转换统计 */
  stats: ConversionStats;
}

/**
 * 转换统计
 */
export interface ConversionStats {
  /** 总匹配数 */
  totalMatches: number;
  /** 按规则统计 */
  byRule: Record<string, number>;
  /** 按类别统计 */
  byCategory: Record<RuleCategory, number>;
}

/**
 * 文件转换选项
 */
export interface FileConvertOptions {
  /** 源数据库类型 */
  from: DatabaseType;
  /** 目标数据库类型（默认 dm） */
  to?: DatabaseType;
  /** 是否就地修改 */
  inPlace?: boolean;
  /** 输出目录（用于批量转换） */
  outputDir?: string;
  /** 是否显示详细信息 */
  verbose?: boolean;
  /** 启用的规则集 */
  rules?: 'all' | 'basic' | 'advanced';
  /** 自定义规则 */
  customRules?: ConversionRule[];
}

/**
 * 文件转换结果
 */
export interface FileConvertResult {
  /** 源文件路径 */
  sourceFile: string;
  /** 目标文件路径 */
  targetFile: string;
  /** 转换结果 */
  result: ConversionResult;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 批量转换结果
 */
export interface BatchConvertResult {
  /** 总文件数 */
  totalFiles: number;
  /** 成功数 */
  successCount: number;
  /** 失败数 */
  failureCount: number;
  /** 文件结果列表 */
  results: FileConvertResult[];
  /** 总耗时（毫秒） */
  duration: number;
}

// ============================================================================
// Oracle → DM 转换规则
// ============================================================================

/**
 * Oracle → DM 转换规则集
 */
export const ORACLE_TO_DM_RULES: ConversionRule[] = [
  // 1. ROWNUM 分页 → LIMIT
  {
    id: 'oracle-rownum-to-limit',
    name: 'ROWNUM 分页转换',
    description: '将 Oracle ROWNUM 分页转换为 DM LIMIT 语法',
    category: 'syntax',
    source: 'oracle',
    pattern: /SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)\s+WHERE\s+ROWNUM\s*<=\s*(\d+)/gi,
    replacement: 'SELECT $1 FROM $2 LIMIT $3',
    examples: [
      {
        before: 'SELECT * FROM (SELECT * FROM users ORDER BY id) WHERE ROWNUM <= 10',
        after: 'SELECT * FROM users ORDER BY id LIMIT 10'
      }
    ]
  },
  // 2. DECODE → CASE WHEN（多值匹配）
  {
    id: 'oracle-decode-to-case-multi',
    name: 'DECODE 函数转换（多值）',
    description: '将 Oracle DECODE 转换为标准 CASE WHEN（支持多值匹配）',
    category: 'function',
    source: 'oracle',
    pattern: /DECODE\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: (match: RegExpMatchArray): string => {
      const expr = match[1].trim();
      const search1 = match[2].trim();
      const result1 = match[3].trim();
      const search2 = match[4].trim();
      const result2 = match[5].trim();
      return `CASE ${expr} WHEN ${search1} THEN ${result1} WHEN ${search2} THEN ${result2} END`;
    },
    examples: [
      {
        before: "DECODE(status, 1, 'active', 0, 'inactive', 'unknown')",
        after: "CASE status WHEN 1 THEN 'active' WHEN 0 THEN 'inactive' ELSE 'unknown' END"
      }
    ]
  },
  // 3. DECODE → CASE WHEN（单值匹配）
  {
    id: 'oracle-decode-to-case-single',
    name: 'DECODE 函数转换（单值）',
    description: '将 Oracle DECODE 转换为标准 CASE WHEN（单值匹配）',
    category: 'function',
    source: 'oracle',
    pattern: /DECODE\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: (match: RegExpMatchArray): string => {
      const expr = match[1].trim();
      const search = match[2].trim();
      const result = match[3].trim();
      return `CASE ${expr} WHEN ${search} THEN ${result} END`;
    },
    examples: [
      {
        before: "DECODE(status, 1, 'active')",
        after: "CASE status WHEN 1 THEN 'active' END"
      }
    ]
  },
  // 4. NVL → COALESCE
  {
    id: 'oracle-nvl-to-coalesce',
    name: 'NVL 函数转换',
    description: '将 Oracle NVL 转换为标准 COALESCE',
    category: 'function',
    source: 'oracle',
    pattern: /NVL\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'COALESCE($1, $2)',
    examples: [
      {
        before: "NVL(name, 'unknown')",
        after: "COALESCE(name, 'unknown')"
      }
    ]
  },
  // 5. NVL2 → CASE WHEN
  {
    id: 'oracle-nvl2-to-case',
    name: 'NVL2 函数转换',
    description: '将 Oracle NVL2 转换为标准 CASE WHEN',
    category: 'function',
    source: 'oracle',
    pattern: /NVL2\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CASE WHEN $1 IS NOT NULL THEN $2 ELSE $3 END',
    examples: [
      {
        before: "NVL2(name, 'has name', 'no name')",
        after: "CASE WHEN name IS NOT NULL THEN 'has name' ELSE 'no name' END"
      }
    ]
  },
  // 6. SYSDATE → CURRENT_TIMESTAMP
  {
    id: 'oracle-sysdate',
    name: 'SYSDATE 转换',
    description: '将 Oracle SYSDATE 转换为 DM CURRENT_TIMESTAMP',
    category: 'function',
    source: 'oracle',
    pattern: /\bSYSDATE\b/gi,
    replacement: 'CURRENT_TIMESTAMP',
    examples: [
      {
        before: 'SELECT SYSDATE FROM DUAL',
        after: 'SELECT CURRENT_TIMESTAMP'
      }
    ]
  },
  // 7. VARCHAR2 → VARCHAR
  {
    id: 'oracle-varchar2-to-varchar',
    name: 'VARCHAR2 类型转换',
    description: '将 Oracle VARCHAR2 转换为 DM VARCHAR',
    category: 'type',
    source: 'oracle',
    pattern: /\bVARCHAR2\b/gi,
    replacement: 'VARCHAR',
    examples: [
      {
        before: 'CREATE TABLE t (name VARCHAR2(100))',
        after: 'CREATE TABLE t (name VARCHAR(100))'
      }
    ]
  },
  // 8. NVARCHAR2 → NVARCHAR
  {
    id: 'oracle-nvarchar2-to-nvarchar',
    name: 'NVARCHAR2 类型转换',
    description: '将 Oracle NVARCHAR2 转换为 DM NVARCHAR',
    category: 'type',
    source: 'oracle',
    pattern: /\bNVARCHAR2\b/gi,
    replacement: 'NVARCHAR',
    examples: []
  },
  // 9. NUMBER → NUMERIC
  {
    id: 'oracle-number-to-numeric',
    name: 'NUMBER 类型转换',
    description: '将 Oracle NUMBER 转换为 DM NUMERIC',
    category: 'type',
    source: 'oracle',
    pattern: /\bNUMBER\b/gi,
    replacement: 'NUMERIC',
    examples: [
      {
        before: 'CREATE TABLE t (id NUMBER(10), price NUMBER(10,2))',
        after: 'CREATE TABLE t (id NUMERIC(10), price NUMERIC(10,2))'
      }
    ]
  },
  // 10. DATE → DATETIME
  {
    id: 'oracle-date-to-datetime',
    name: 'DATE 类型转换',
    description: '将 Oracle DATE 转换为 DM DATETIME',
    category: 'type',
    source: 'oracle',
    pattern: /\bDATE\b/gi,
    replacement: 'DATETIME',
    examples: [
      {
        before: 'CREATE TABLE t (created_at DATE)',
        after: 'CREATE TABLE t (created_at DATETIME)'
      }
    ]
  },
  // 11. TO_DATE → CONVERT
  {
    id: 'oracle-to-date',
    name: 'TO_DATE 函数转换',
    description: '将 Oracle TO_DATE 转换为 DM CONVERT',
    category: 'function',
    source: 'oracle',
    pattern: /TO_DATE\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CONVERT(DATETIME, $1, 120)',
    examples: [
      {
        before: "TO_DATE('2024-01-01', 'YYYY-MM-DD')",
        after: "CONVERT(DATETIME, '2024-01-01', 120)"
      }
    ]
  },
  // 12. TO_CHAR → CONVERT
  {
    id: 'oracle-to-char',
    name: 'TO_CHAR 函数转换',
    description: '将 Oracle TO_CHAR 转换为 DM CONVERT',
    category: 'function',
    source: 'oracle',
    pattern: /TO_CHAR\s*\(\s*([^,)]+?)\s*\)/gi,
    replacement: 'CONVERT(VARCHAR, $1)',
    examples: [
      {
        before: 'TO_CHAR(id)',
        after: 'CONVERT(VARCHAR, id)'
      }
    ]
  },
  // 13. DUAL 表处理
  {
    id: 'oracle-dual',
    name: 'DUAL 表处理',
    description: '移除 Oracle DUAL 表（DM 不需要）',
    category: 'syntax',
    source: 'oracle',
    pattern: /\bFROM\s+DUAL\b/gi,
    replacement: '',
    examples: [
      {
        before: 'SELECT 1 FROM DUAL',
        after: 'SELECT 1'
      }
    ]
  },
  // 14. 空字符串处理（标记差异）
  {
    id: 'oracle-empty-string',
    name: '空字符串处理',
    description: '标记 Oracle 空字符串处理差异（Oracle: \'\' = NULL, DM: \'\' ≠ NULL）',
    category: 'syntax',
    source: 'oracle',
    pattern: /(?:=\s*''|''\s*=)/g,
    replacement: (match: RegExpMatchArray): string => {
      return `/* TODO: 空字符串处理差异 - Oracle中''等于NULL，DM中不等于 */ ${match[0]}`;
    },
    examples: []
  },
  // 15. || 字符串连接（DM 兼容，无需转换）
  // 16. SUBSTR → SUBSTRING
  {
    id: 'oracle-substr',
    name: 'SUBSTR 函数转换',
    description: '将 Oracle SUBSTR 转换为标准 SUBSTRING',
    category: 'function',
    source: 'oracle',
    pattern: /\bSUBSTR\s*\(/gi,
    replacement: 'SUBSTRING(',
    examples: [
      {
        before: 'SUBSTR(name, 1, 10)',
        after: 'SUBSTRING(name, 1, 10)'
      }
    ]
  },
  // 17. INSTR → CHARINDEX
  {
    id: 'oracle-instr',
    name: 'INSTR 函数转换',
    description: '将 Oracle INSTR 转换为 DM CHARINDEX',
    category: 'function',
    source: 'oracle',
    pattern: /INSTR\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CHARINDEX($2, $1)',
    examples: [
      {
        before: "INSTR(name, 'test')",
        after: "CHARINDEX('test', name)"
      }
    ]
  },
  // 18. TRIM 函数（DM 兼容，无需转换）
  // 19. LPAD/RPAD（DM 兼容，无需转换）
  // 20. SYSTIMESTAMP → CURRENT_TIMESTAMP
  {
    id: 'oracle-systimestamp',
    name: 'SYSTIMESTAMP 转换',
    description: '将 Oracle SYSTIMESTAMP 转换为 DM CURRENT_TIMESTAMP',
    category: 'function',
    source: 'oracle',
    pattern: /\bSYSTIMESTAMP\b/gi,
    replacement: 'CURRENT_TIMESTAMP',
    examples: []
  }
];

// ============================================================================
// MySQL → DM 转换规则
// ============================================================================

/**
 * MySQL → DM 转换规则集
 */
export const MYSQL_TO_DM_RULES: ConversionRule[] = [
  // 1. AUTO_INCREMENT → IDENTITY
  {
    id: 'mysql-auto-increment',
    name: 'AUTO_INCREMENT 转换',
    description: '将 MySQL AUTO_INCREMENT 转换为 DM IDENTITY',
    category: 'type',
    source: 'mysql',
    pattern: /\bAUTO_INCREMENT\b/gi,
    replacement: 'IDENTITY(1,1)',
    examples: [
      {
        before: 'CREATE TABLE t (id INT AUTO_INCREMENT, name VARCHAR(50))',
        after: 'CREATE TABLE t (id INT IDENTITY(1,1), name VARCHAR(50))'
      }
    ]
  },
  // 2. IFNULL → COALESCE
  {
    id: 'mysql-ifnull-to-coalesce',
    name: 'IFNULL 函数转换',
    description: '将 MySQL IFNULL 转换为标准 COALESCE',
    category: 'function',
    source: 'mysql',
    pattern: /IFNULL\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'COALESCE($1, $2)',
    examples: [
      {
        before: "IFNULL(name, 'unknown')",
        after: "COALESCE(name, 'unknown')"
      }
    ]
  },
  // 3. ENUM → VARCHAR
  {
    id: 'mysql-enum-to-varchar',
    name: 'ENUM 类型转换',
    description: '将 MySQL ENUM 转换为 DM VARCHAR',
    category: 'type',
    source: 'mysql',
    pattern: /ENUM\s*\([^)]+\)/gi,
    replacement: 'VARCHAR(255)',
    examples: [
      {
        before: "CREATE TABLE t (status ENUM('active', 'inactive'))",
        after: 'CREATE TABLE t (status VARCHAR(255))'
      }
    ]
  },
  // 4. JSON → TEXT
  {
    id: 'mysql-json-to-text',
    name: 'JSON 类型转换',
    description: '将 MySQL JSON 转换为 DM TEXT',
    category: 'type',
    source: 'mysql',
    pattern: /\bJSON\b/gi,
    replacement: 'TEXT',
    examples: [
      {
        before: 'CREATE TABLE t (data JSON)',
        after: 'CREATE TABLE t (data TEXT)'
      }
    ]
  },
  // 5. TINYINT → SMALLINT
  {
    id: 'mysql-tinyint-to-smallint',
    name: 'TINYINT 类型转换',
    description: '将 MySQL TINYINT 转换为 DM SMALLINT',
    category: 'type',
    source: 'mysql',
    pattern: /\bTINYINT\b/gi,
    replacement: 'SMALLINT',
    examples: [
      {
        before: 'CREATE TABLE t (flag TINYINT)',
        after: 'CREATE TABLE t (flag SMALLINT)'
      }
    ]
  },
  // 6. MEDIUMINT → INTEGER
  {
    id: 'mysql-mediumint-to-integer',
    name: 'MEDIUMINT 类型转换',
    description: '将 MySQL MEDIUMINT 转换为 DM INTEGER',
    category: 'type',
    source: 'mysql',
    pattern: /\bMEDIUMINT\b/gi,
    replacement: 'INTEGER',
    examples: []
  },
  // 7. LONGTEXT → CLOB
  {
    id: 'mysql-longtext-to-clob',
    name: 'LONGTEXT 类型转换',
    description: '将 MySQL LONGTEXT 转换为 DM CLOB',
    category: 'type',
    source: 'mysql',
    pattern: /\bLONGTEXT\b/gi,
    replacement: 'CLOB',
    examples: []
  },
  // 8. MEDIUMTEXT → CLOB
  {
    id: 'mysql-mediumtext-to-clob',
    name: 'MEDIUMTEXT 类型转换',
    description: '将 MySQL MEDIUMTEXT 转换为 DM CLOB',
    category: 'type',
    source: 'mysql',
    pattern: /\bMEDIUMTEXT\b/gi,
    replacement: 'CLOB',
    examples: []
  },
  // 9. LONGBLOB → BLOB
  {
    id: 'mysql-longblob-to-blob',
    name: 'LONGBLOB 类型转换',
    description: '将 MySQL LONGBLOB 转换为 DM BLOB',
    category: 'type',
    source: 'mysql',
    pattern: /\bLONGBLOB\b/gi,
    replacement: 'BLOB',
    examples: []
  },
  // 10. MEDIUMBLOB → BLOB
  {
    id: 'mysql-mediumblob-to-blob',
    name: 'MEDIUMBLOB 类型转换',
    description: '将 MySQL MEDIUMBLOB 转换为 DM BLOB',
    category: 'type',
    source: 'mysql',
    pattern: /\bMEDIUMBLOB\b/gi,
    replacement: 'BLOB',
    examples: []
  },
  // 11. SET → VARCHAR
  {
    id: 'mysql-set-to-varchar',
    name: 'SET 类型转换',
    description: '将 MySQL SET 转换为 DM VARCHAR',
    category: 'type',
    source: 'mysql',
    pattern: /SET\s*\([^)]+\)/gi,
    replacement: 'VARCHAR(255)',
    examples: []
  },
  // 12. BOOLEAN → BIT
  {
    id: 'mysql-boolean-to-bit',
    name: 'BOOLEAN 类型转换',
    description: '将 MySQL BOOLEAN 转换为 DM BIT',
    category: 'type',
    source: 'mysql',
    pattern: /\bBOOLEAN\b/gi,
    replacement: 'BIT',
    examples: []
  },
  // 13. NOW() → CURRENT_TIMESTAMP
  {
    id: 'mysql-now',
    name: 'NOW() 函数转换',
    description: '将 MySQL NOW() 转换为 DM CURRENT_TIMESTAMP',
    category: 'function',
    source: 'mysql',
    pattern: /\bNOW\s*\(\s*\)/gi,
    replacement: 'CURRENT_TIMESTAMP',
    examples: [
      {
        before: 'SELECT NOW()',
        after: 'SELECT CURRENT_TIMESTAMP'
      }
    ]
  },
  // 14. CURDATE() → CURRENT_DATE
  {
    id: 'mysql-curdate',
    name: 'CURDATE() 函数转换',
    description: '将 MySQL CURDATE() 转换为 DM CURRENT_DATE',
    category: 'function',
    source: 'mysql',
    pattern: /\bCURDATE\s*\(\s*\)/gi,
    replacement: 'CURRENT_DATE',
    examples: []
  },
  // 15. CURTIME() → CURRENT_TIME
  {
    id: 'mysql-curtime',
    name: 'CURTIME() 函数转换',
    description: '将 MySQL CURTIME() 转换为 DM CURRENT_TIME',
    category: 'function',
    source: 'mysql',
    pattern: /\bCURTIME\s*\(\s*\)/gi,
    replacement: 'CURRENT_TIME',
    examples: []
  },
  // 16. DATE_FORMAT → CONVERT
  {
    id: 'mysql-date-format',
    name: 'DATE_FORMAT 函数转换',
    description: '将 MySQL DATE_FORMAT 转换为 DM CONVERT',
    category: 'function',
    source: 'mysql',
    pattern: /DATE_FORMAT\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CONVERT(VARCHAR, $1, 120)',
    examples: [
      {
        before: "DATE_FORMAT(created_at, '%Y-%m-%d')",
        after: 'CONVERT(VARCHAR, created_at, 120)'
      }
    ]
  },
  // 17. STR_TO_DATE → CONVERT
  {
    id: 'mysql-str-to-date',
    name: 'STR_TO_DATE 函数转换',
    description: '将 MySQL STR_TO_DATE 转换为 DM CONVERT',
    category: 'function',
    source: 'mysql',
    pattern: /STR_TO_DATE\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CONVERT(DATETIME, $1, 120)',
    examples: [
      {
        before: "STR_TO_DATE('2024-01-01', '%Y-%m-%d')",
        after: "CONVERT(DATETIME, '2024-01-01', 120)"
      }
    ]
  },
  // 18. LIMIT 语法（DM 兼容，无需转换）
  // 19. GROUP_CONCAT → STRING_AGG
  {
    id: 'mysql-group-concat',
    name: 'GROUP_CONCAT 函数转换',
    description: '将 MySQL GROUP_CONCAT 转换为 DM STRING_AGG',
    category: 'function',
    source: 'mysql',
    pattern: /GROUP_CONCAT\s*\(\s*([^)]+?)\s*\)/gi,
    replacement: 'STRING_AGG($1, \',\')',
    examples: [
      {
        before: 'GROUP_CONCAT(name)',
        after: "STRING_AGG(name, ',')"
      }
    ]
  },
  // 20. IF → CASE WHEN
  {
    id: 'mysql-if-to-case',
    name: 'IF 函数转换',
    description: '将 MySQL IF 转换为标准 CASE WHEN',
    category: 'function',
    source: 'mysql',
    pattern: /IF\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    replacement: 'CASE WHEN $1 THEN $2 ELSE $3 END',
    examples: [
      {
        before: "IF(status = 1, 'active', 'inactive')",
        after: "CASE WHEN status = 1 THEN 'active' ELSE 'inactive' END"
      }
    ]
  }
];

// ============================================================================
// SQL 转换器类
// ============================================================================

/**
 * SQL 语法转换器
 * 支持 Oracle/MySQL → DM 的 SQL 语法转换
 */
export class SqlConverter {
  private rules: ConversionRule[];
  private options: FileConvertOptions;

  constructor(options: FileConvertOptions) {
    this.options = {
      to: 'dm',
      inPlace: false,
      verbose: false,
      rules: 'all',
      ...options
    };

    // 加载规则
    this.rules = this.loadRules();
  }

  /**
   * 加载转换规则
   */
  private loadRules(): ConversionRule[] {
    let rules: ConversionRule[] = [];

    // 根据源数据库类型加载规则
    switch (this.options.from) {
      case 'oracle':
        rules = [...ORACLE_TO_DM_RULES];
        break;
      case 'mysql':
        rules = [...MYSQL_TO_DM_RULES];
        break;
      default:
        throw new Error(`不支持的源数据库类型: ${this.options.from}`);
    }

    // 根据规则集过滤
    if (this.options.rules === 'basic') {
      rules = rules.filter(r => r.category === 'type' || r.category === 'keyword');
    }

    // 添加自定义规则
    if (this.options.customRules) {
      rules = [...rules, ...this.options.customRules];
    }

    return rules;
  }

  /**
   * 转换 SQL 内容
   */
  convert(sql: string): ConversionResult {
    let converted = sql;
    const appliedRules: string[] = [];
    const stats: ConversionStats = {
      totalMatches: 0,
      byRule: {},
      byCategory: {
        syntax: 0,
        function: 0,
        type: 0,
        keyword: 0
      }
    };

    // 应用每条规则
    for (const rule of this.rules) {
      const matches = converted.match(rule.pattern);

      if (matches && matches.length > 0) {
        // 统计匹配数
        stats.totalMatches += matches.length;
        stats.byRule[rule.id] = matches.length;
        stats.byCategory[rule.category] += matches.length;

        // 应用替换
        if (typeof rule.replacement === 'function') {
          // 使用函数替换
          converted = converted.replace(rule.pattern, (...args) => {
            const match = args.slice(0, -2) as unknown as RegExpMatchArray;
            return rule.replacement(match);
          });
        } else {
          // 使用字符串替换
          converted = converted.replace(rule.pattern, rule.replacement);
        }

        appliedRules.push(rule.id);
      }
    }

    return {
      original: sql,
      converted,
      appliedRules,
      stats
    };
  }

  /**
   * 转换文件
   */
  async convertFile(filePath: string): Promise<FileConvertResult> {
    try {
      // 读取源文件
      const content = fs.readFileSync(filePath, 'utf8');

      // 执行转换
      const result = this.convert(content);

      // 确定目标文件路径
      let targetFile: string;
      if (this.options.inPlace) {
        targetFile = filePath;
      } else if (this.options.outputDir) {
        const fileName = path.basename(filePath);
        targetFile = path.join(this.options.outputDir, fileName);
      } else {
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const dir = path.dirname(filePath);
        targetFile = path.join(dir, `${baseName}_converted${ext}`);
      }

      // 确保输出目录存在
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 写入目标文件
      fs.writeFileSync(targetFile, result.converted, 'utf8');

      return {
        sourceFile: filePath,
        targetFile,
        result,
        success: true
      };
    } catch (error) {
      return {
        sourceFile: filePath,
        targetFile: '',
        result: {
          original: '',
          converted: '',
          appliedRules: [],
          stats: { totalMatches: 0, byRule: {}, byCategory: { syntax: 0, function: 0, type: 0, keyword: 0 } }
        },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 批量转换文件
   */
  async convertBatch(filePaths: string[]): Promise<BatchConvertResult> {
    const startTime = Date.now();
    const results: FileConvertResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const filePath of filePaths) {
      const result = await this.convertFile(filePath);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      totalFiles: filePaths.length,
      successCount,
      failureCount,
      results,
      duration: Date.now() - startTime
    };
  }

  /**
   * 转换目录中的所有 SQL 文件
   */
  async convertDirectory(dirPath: string): Promise<BatchConvertResult> {
    // 获取目录中的所有 SQL 文件
    const files = this.getSqlFiles(dirPath);

    if (files.length === 0) {
      return {
        totalFiles: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
        duration: 0
      };
    }

    return this.convertBatch(files);
  }

  /**
   * 获取目录中的所有 SQL 文件
   */
  private getSqlFiles(dirPath: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dirPath)) {
      return files;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // 递归处理子目录
        const subFiles = this.getSqlFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && /\.sql$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 获取所有可用规则
   */
  getRules(): ConversionRule[] {
    return [...this.rules];
  }

  /**
   * 获取规则统计
   */
  getRuleStats(): { total: number; byCategory: Record<RuleCategory, number>; bySource: Record<DatabaseType, number> } {
    const byCategory: Record<RuleCategory, number> = {
      syntax: 0,
      function: 0,
      type: 0,
      keyword: 0
    };
    const bySource: Record<DatabaseType, number> = {
      oracle: 0,
      mysql: 0,
      dm: 0
    };

    for (const rule of this.rules) {
      byCategory[rule.category]++;
      bySource[rule.source]++;
    }

    return {
      total: this.rules.length,
      byCategory,
      bySource
    };
  }
}

// ============================================================================
// 工厂函数和工具函数
// ============================================================================

/**
 * 创建 SQL 转换器实例
 */
export function createSqlConverter(options: FileConvertOptions): SqlConverter {
  return new SqlConverter(options);
}

/**
 * 快速转换单个 SQL 字符串
 */
export function convertSql(
  sql: string,
  from: DatabaseType,
  to: DatabaseType = 'dm'
): ConversionResult {
  const converter = createSqlConverter({ from, to });
  return converter.convert(sql);
}

/**
 * 快速转换文件
 */
export async function convertSqlFile(
  filePath: string,
  options: FileConvertOptions
): Promise<FileConvertResult> {
  const converter = createSqlConverter(options);
  return converter.convertFile(filePath);
}

/**
 * 快速批量转换
 */
export async function convertSqlBatch(
  filePaths: string[],
  options: FileConvertOptions
): Promise<BatchConvertResult> {
  const converter = createSqlConverter(options);
  return converter.convertBatch(filePaths);
}

/**
 * 快速转换目录
 */
export async function convertSqlDirectory(
  dirPath: string,
  options: FileConvertOptions
): Promise<BatchConvertResult> {
  const converter = createSqlConverter(options);
  return converter.convertDirectory(dirPath);
}

/**
 * 打印转换结果统计
 */
export function printConversionStats(result: ConversionResult): void {
  console.log(chalk.cyan('\n=== 转换统计 ==='));
  console.log(chalk.white(`总匹配数: ${result.stats.totalMatches}`));

  if (result.appliedRules.length > 0) {
    console.log(chalk.white('\n应用的规则:'));
    for (const ruleId of result.appliedRules) {
      const count = result.stats.byRule[ruleId] || 0;
      console.log(chalk.gray(`  - ${ruleId}: ${count} 次`));
    }
  }

  console.log(chalk.white('\n按类别统计:'));
  for (const [category, count] of Object.entries(result.stats.byCategory)) {
    if (count > 0) {
      console.log(chalk.gray(`  - ${category}: ${count} 次`));
    }
  }
}

/**
 * 打印批量转换结果统计
 */
export function printBatchConversionStats(result: BatchConvertResult): void {
  console.log(chalk.cyan('\n=== 批量转换统计 ==='));
  console.log(chalk.white(`总文件数: ${result.totalFiles}`));
  console.log(chalk.green(`成功: ${result.successCount}`));
  console.log(chalk.red(`失败: ${result.failureCount}`));
  console.log(chalk.white(`耗时: ${(result.duration / 1000).toFixed(2)}s`));

  if (result.failureCount > 0) {
    console.log(chalk.red('\n失败文件:'));
    for (const fileResult of result.results) {
      if (!fileResult.success) {
        console.log(chalk.red(`  - ${fileResult.sourceFile}: ${fileResult.error}`));
      }
    }
  }
}
