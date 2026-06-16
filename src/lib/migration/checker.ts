/**
 * 迁移兼容性检查器
 *
 * 在数据库迁移前执行全面的兼容性分析，检查：
 * - 数据类型兼容性
 * - SQL 语法差异
 * - 空字符串处理差异
 * - 存储过程/函数兼容性
 * - 触发器兼容性
 * - 序列兼容性
 *
 * 支持 Oracle → DM、MySQL → DM 等迁移路径
 */

// ==================== 类型定义 ====================

/**
 * 数据库类型
 */
export type DatabaseType = 'oracle' | 'mysql' | 'postgres' | 'sqlserver' | 'dm';

/**
 * 问题严重级别
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * 问题类别
 */
export type IssueCategory = 'datatype' | 'syntax' | 'object' | 'constraint' | 'index';

/**
 * 报告格式
 */
export type ReportFormat = 'text' | 'json' | 'html';

/**
 * 兼容性问题接口
 */
export interface MigrationIssue {
  /** 严重级别 */
  severity: IssueSeverity;
  /** 问题类别 */
  category: IssueCategory;
  /** 相关对象名称（表名、视图名等） */
  object: string;
  /** 相关列名（可选） */
  column?: string;
  /** 问题描述 */
  message: string;
  /** 源数据库定义 */
  sourceDefinition?: string;
  /** 目标数据库定义 */
  targetDefinition?: string;
  /** 解决方案建议 */
  solution?: string;
  /** 是否可自动修复 */
  autoFixable: boolean;
}

/**
 * 表结构信息
 */
export interface TableInfo {
  /** 表名 */
  name: string;
  /** Schema */
  schema?: string;
  /** 列定义 */
  columns: ColumnInfo[];
}

/**
 * 列信息
 */
export interface ColumnInfo {
  /** 列名 */
  name: string;
  /** 数据类型 */
  dataType: string;
  /** 类型参数（如 NUMBER(10,2) 中的 10,2） */
  typeParams?: string;
  /** 是否可空 */
  nullable: boolean;
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 存储过程/函数信息
 */
export interface ProcedureInfo {
  /** 名称 */
  name: string;
  /** 类型：过程或函数 */
  type: 'procedure' | 'function';
  /** SQL 定义 */
  definition: string;
  /** Schema */
  schema?: string;
}

/**
 * 视图信息
 */
export interface ViewInfo {
  /** 视图名 */
  name: string;
  /** SQL 定义 */
  definition: string;
  /** Schema */
  schema?: string;
}

/**
 * 触发器信息
 */
export interface TriggerInfo {
  /** 触发器名 */
  name: string;
  /** 触发事件 */
  event: string;
  /** 触发时机 */
  timing: string;
  /** SQL 定义 */
  definition: string;
  /** 关联表 */
  tableName: string;
  /** Schema */
  schema?: string;
}

/**
 * 序列信息
 */
export interface SequenceInfo {
  /** 序列名 */
  name: string;
  /** 起始值 */
  startValue: number;
  /** 增量 */
  increment: number;
  /** 最小值 */
  minValue?: number;
  /** 最大值 */
  maxValue?: number;
  /** 是否循环 */
  cycle: boolean;
  /** Schema */
  schema?: string;
}

/**
 * 迁移检查结果接口
 */
export interface MigrationCheckResult {
  /** 源数据库类型 */
  source: DatabaseType;
  /** 目标数据库类型 */
  target: DatabaseType;
  /** 检查摘要 */
  summary: {
    /** 表数量 */
    totalTables: number;
    /** 视图数量 */
    totalViews: number;
    /** 存储过程数量 */
    totalProcedures: number;
    /** 函数数量 */
    totalFunctions: number;
    /** 触发器数量 */
    totalTriggers: number;
    /** 序列数量 */
    totalSequences: number;
    /** 兼容性评分（0-100） */
    compatibilityScore: number;
  };
  /** 发现的问题列表 */
  issues: MigrationIssue[];
  /** 迁移建议 */
  recommendations: string[];
}

// ==================== 数据类型映射 ====================

/**
 * Oracle → DM 数据类型映射
 */
const ORACLE_TO_DM_TYPE_MAP: Record<string, string> = {
  'NUMBER': 'NUMERIC',
  'VARCHAR2': 'VARCHAR',
  'NVARCHAR2': 'NVARCHAR',
  'CHAR': 'CHAR',
  'NCHAR': 'NCHAR',
  'CLOB': 'CLOB',
  'NCLOB': 'TEXT',
  'BLOB': 'BLOB',
  'DATE': 'DATETIME',
  'TIMESTAMP': 'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE': 'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMP WITH LOCAL TIME ZONE': 'TIMESTAMP',
  'RAW': 'VARBINARY',
  'ROWID': 'VARCHAR',
  'FLOAT': 'DOUBLE',
  'BINARY_FLOAT': 'FLOAT',
  'BINARY_DOUBLE': 'DOUBLE',
  'LONG': 'TEXT',
  'LONG RAW': 'BLOB',
  'XMLTYPE': 'TEXT',
  'SDO_GEOMETRY': 'TEXT',
};

/**
 * MySQL → DM 数据类型映射
 */
const MYSQL_TO_DM_TYPE_MAP: Record<string, string> = {
  'INT': 'INTEGER',
  'TINYINT': 'SMALLINT',
  'SMALLINT': 'SMALLINT',
  'MEDIUMINT': 'INTEGER',
  'BIGINT': 'BIGINT',
  'FLOAT': 'FLOAT',
  'DOUBLE': 'DOUBLE',
  'DECIMAL': 'DECIMAL',
  'NUMERIC': 'NUMERIC',
  'CHAR': 'CHAR',
  'VARCHAR': 'VARCHAR',
  'BINARY': 'BINARY',
  'VARBINARY': 'VARBINARY',
  'TINYBLOB': 'BLOB',
  'BLOB': 'BLOB',
  'MEDIUMBLOB': 'BLOB',
  'LONGBLOB': 'BLOB',
  'TINYTEXT': 'TEXT',
  'TEXT': 'TEXT',
  'MEDIUMTEXT': 'TEXT',
  'LONGTEXT': 'CLOB',
  'ENUM': 'VARCHAR',
  'SET': 'VARCHAR',
  'DATE': 'DATE',
  'DATETIME': 'DATETIME',
  'TIMESTAMP': 'TIMESTAMP',
  'TIME': 'TIME',
  'YEAR': 'SMALLINT',
  'JSON': 'TEXT',
  'BOOLEAN': 'BIT',
  'BIT': 'BIT',
};

/**
 * 获取类型映射表
 */
function getTypeMap(source: DatabaseType, target: DatabaseType): Record<string, string> {
  if (target !== 'dm') {
    return {};
  }

  switch (source) {
    case 'oracle':
      return ORACLE_TO_DM_TYPE_MAP;
    case 'mysql':
      return MYSQL_TO_DM_TYPE_MAP;
    default:
      return {};
  }
}

// ==================== SQL 语法检查规则 ====================

/**
 * SQL 语法检查规则
 */
interface SyntaxCheckRule {
  /** 规则 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 匹配的正则表达式 */
  pattern: RegExp;
  /** 问题严重级别 */
  severity: IssueSeverity;
  /** 问题描述模板 */
  message: string;
  /** 解决方案 */
  solution: string;
  /** 是否可自动修复 */
  autoFixable: boolean;
}

/**
 * Oracle SQL 语法检查规则
 */
const ORACLE_SYNTAX_RULES: SyntaxCheckRule[] = [
  {
    id: 'rownum',
    name: 'ROWNUM 分页',
    pattern: /\bROWNUM\b/gi,
    severity: 'warning',
    message: 'Oracle ROWNUM 语法在 DM 中需要转换为 LIMIT',
    solution: '使用 LIMIT 语法替代 ROWNUM，或启用 DM 的 Oracle 兼容模式',
    autoFixable: true,
  },
  {
    id: 'decode',
    name: 'DECODE 函数',
    pattern: /\bDECODE\s*\(/gi,
    severity: 'warning',
    message: 'Oracle DECODE 函数需要转换为标准 CASE WHEN',
    solution: '将 DECODE(expr, search1, result1, ..., default) 转换为 CASE expr WHEN search1 THEN result1 ... ELSE default END',
    autoFixable: true,
  },
  {
    id: 'nvl',
    name: 'NVL 函数',
    pattern: /\bNVL\s*\(/gi,
    severity: 'info',
    message: 'Oracle NVL 函数建议转换为标准 COALESCE',
    solution: '将 NVL(expr1, expr2) 转换为 COALESCE(expr1, expr2)',
    autoFixable: true,
  },
  {
    id: 'nvl2',
    name: 'NVL2 函数',
    pattern: /\bNVL2\s*\(/gi,
    severity: 'warning',
    message: 'Oracle NVL2 函数需要转换为标准 CASE WHEN',
    solution: '将 NVL2(expr1, expr2, expr3) 转换为 CASE WHEN expr1 IS NOT NULL THEN expr2 ELSE expr3 END',
    autoFixable: true,
  },
  {
    id: 'sysdate',
    name: 'SYSDATE 函数',
    pattern: /\bSYSDATE\b/gi,
    severity: 'info',
    message: 'Oracle SYSDATE 建议转换为 DM CURRENT_TIMESTAMP',
    solution: '将 SYSDATE 替换为 CURRENT_TIMESTAMP，或启用 DM 的 Oracle 兼容模式',
    autoFixable: true,
  },
  {
    id: 'empty-string',
    name: '空字符串比较',
    pattern: /(?:=\s*''|''\s*=)/g,
    severity: 'error',
    message: 'Oracle 中空字符串等于 NULL，DM 中空字符串不等于 NULL',
    solution: '将 column = \'\' 修改为 column IS NULL 或 column = \'\' AND column IS NULL',
    autoFixable: false,
  },
  {
    id: 'connect-by',
    name: 'CONNECT BY 层次查询',
    pattern: /\bCONNECT\s+BY\b/gi,
    severity: 'error',
    message: 'Oracle CONNECT BY 层次查询语法需要转换',
    solution: '使用 DM 的 CONNECT BY 语法（DM 支持）或转换为 CTE 递归查询',
    autoFixable: false,
  },
  {
    id: 'merge',
    name: 'MERGE 语句',
    pattern: /\bMERGE\s+INTO\b/gi,
    severity: 'info',
    message: 'MERGE 语句语法可能有差异',
    solution: '检查 DM 的 MERGE 语法兼容性，必要时调整',
    autoFixable: false,
  },
  {
    id: 'hint',
    name: 'Oracle Hint',
    pattern: /\b\/\*\+.*?\*\//g,
    severity: 'warning',
    message: 'Oracle Hint 语法在 DM 中可能不被支持',
    solution: '移除或替换为 DM 的 Hint 语法',
    autoFixable: false,
  },
];

/**
 * MySQL SQL 语法检查规则
 */
const MYSQL_SYNTAX_RULES: SyntaxCheckRule[] = [
  {
    id: 'auto-increment',
    name: 'AUTO_INCREMENT',
    pattern: /\bAUTO_INCREMENT\b/gi,
    severity: 'info',
    message: 'MySQL AUTO_INCREMENT 需要转换为 DM IDENTITY',
    solution: '将 AUTO_INCREMENT 替换为 IDENTITY(1,1)',
    autoFixable: true,
  },
  {
    id: 'ifnull',
    name: 'IFNULL 函数',
    pattern: /\bIFNULL\s*\(/gi,
    severity: 'info',
    message: 'MySQL IFNULL 函数建议转换为标准 COALESCE',
    solution: '将 IFNULL(expr1, expr2) 转换为 COALESCE(expr1, expr2)',
    autoFixable: true,
  },
  {
    id: 'group-concat',
    name: 'GROUP_CONCAT 函数',
    pattern: /\bGROUP_CONCAT\s*\(/gi,
    severity: 'warning',
    message: 'MySQL GROUP_CONCAT 函数需要转换为 DM LISTAGG',
    solution: '将 GROUP_CONCAT(expr SEPARATOR sep) 转换为 LISTAGG(expr, sep)',
    autoFixable: true,
  },
  {
    id: 'limit-offset',
    name: 'LIMIT 语法',
    pattern: /\bLIMIT\s+\d+\s*,\s*\d+/gi,
    severity: 'info',
    message: 'MySQL LIMIT offset, count 语法需要调整',
    solution: '将 LIMIT offset, count 转换为 LIMIT count OFFSET offset',
    autoFixable: true,
  },
  {
    id: 'backtick',
    name: '反引号标识符',
    pattern: /`[^`]+`/g,
    severity: 'info',
    message: 'MySQL 反引号标识符在 DM 中应使用双引号',
    solution: '将 `identifier` 替换为 "identifier"',
    autoFixable: true,
  },
];

/**
 * 获取语法检查规则
 */
function getSyntaxRules(source: DatabaseType): SyntaxCheckRule[] {
  switch (source) {
    case 'oracle':
      return ORACLE_SYNTAX_RULES;
    case 'mysql':
      return MYSQL_SYNTAX_RULES;
    default:
      return [];
  }
}

// ==================== MigrationChecker 类 ====================

/**
 * 迁移兼容性检查器类
 */
export class MigrationChecker {
  private source: DatabaseType;
  private target: DatabaseType;

  constructor(source: DatabaseType, target: DatabaseType = 'dm') {
    this.source = source;
    this.target = target;
  }

  /**
   * 执行完整的兼容性检查
   *
   * @param tables - 表结构信息
   * @param procedures - 存储过程/函数信息
   * @param views - 视图信息
   * @param triggers - 触发器信息
   * @param sequences - 序列信息
   * @returns 检查结果
   */
  async checkCompatibility(
    tables: TableInfo[],
    procedures?: ProcedureInfo[],
    views?: ViewInfo[],
    triggers?: TriggerInfo[],
    sequences?: SequenceInfo[]
  ): Promise<MigrationCheckResult> {
    const issues: MigrationIssue[] = [];
    const recommendations: string[] = [];

    // 1. 检查数据类型兼容性
    const dataTypeIssues = this.checkDataTypes(tables);
    issues.push(...dataTypeIssues);

    // 2. 检查 SQL 语法兼容性
    const syntaxIssues = this.checkSQLSyntax(procedures || []);
    issues.push(...syntaxIssues);

    // 3. 检查对象兼容性
    const objectIssues = this.checkObjects(views || [], triggers || [], sequences || []);
    issues.push(...objectIssues);

    // 4. 生成迁移建议
    recommendations.push(...this.generateRecommendations(issues));

    // 5. 计算兼容性评分
    const compatibilityScore = this.calculateScore(issues, tables.length);

    return {
      source: this.source,
      target: this.target,
      summary: {
        totalTables: tables.length,
        totalViews: views?.length || 0,
        totalProcedures: procedures?.filter(p => p.type === 'procedure').length || 0,
        totalFunctions: procedures?.filter(p => p.type === 'function').length || 0,
        totalTriggers: triggers?.length || 0,
        totalSequences: sequences?.length || 0,
        compatibilityScore,
      },
      issues,
      recommendations,
    };
  }

  /**
   * 检查数据类型兼容性
   *
   * @param tables - 表结构信息
   * @returns 数据类型相关的问题列表
   */
  checkDataTypes(tables: TableInfo[]): MigrationIssue[] {
    const issues: MigrationIssue[] = [];
    const typeMap = getTypeMap(this.source, this.target);

    for (const table of tables) {
      for (const column of table.columns) {
        const sourceType = column.dataType.toUpperCase();
        const targetType = typeMap[sourceType];

        if (targetType) {
          // 类型需要转换
          const sourceDef = column.typeParams
            ? `${sourceType}(${column.typeParams})`
            : sourceType;
          const targetDef = column.typeParams
            ? `${targetType}(${column.typeParams})`
            : targetType;

          // 检查特殊类型处理
          const specialIssue = this.checkSpecialTypeConversion(
            table.name,
            column.name,
            sourceType,
            targetType,
            sourceDef,
            targetDef
          );

          if (specialIssue) {
            issues.push(specialIssue);
          }
        } else if (!this.isTypeCompatible(sourceType)) {
          // 类型不兼容且无映射
          issues.push({
            severity: 'error',
            category: 'datatype',
            object: table.name,
            column: column.name,
            message: `数据类型 ${sourceType} 在 DM 中无对应类型`,
            sourceDefinition: column.typeParams
              ? `${sourceType}(${column.typeParams})`
              : sourceType,
            solution: `需要手动选择合适的 DM 数据类型替代 ${sourceType}`,
            autoFixable: false,
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查特殊类型转换
   */
  private checkSpecialTypeConversion(
    tableName: string,
    columnName: string,
    sourceType: string,
    _targetType: string,
    sourceDef: string,
    targetDef: string
  ): MigrationIssue | null {
    // Oracle NUMBER 类型特殊处理
    if (this.source === 'oracle' && sourceType === 'NUMBER') {
      // NUMBER 无参数可能是浮点数
      return {
        severity: 'warning',
        category: 'datatype',
        object: tableName,
        column: columnName,
        message: `Oracle NUMBER 类型需要确认精度和标度`,
        sourceDefinition: sourceDef,
        targetDefinition: targetDef,
        solution: '建议明确指定 NUMERIC(precision, scale) 或使用 INTEGER/BIGINT',
        autoFixable: false,
      };
    }

    // Oracle VARCHAR2 到 DM VARCHAR
    if (this.source === 'oracle' && sourceType === 'VARCHAR2') {
      return {
        severity: 'info',
        category: 'datatype',
        object: tableName,
        column: columnName,
        message: `VARCHAR2 将转换为 VARCHAR`,
        sourceDefinition: sourceDef,
        targetDefinition: targetDef,
        solution: 'VARCHAR2 和 VARCHAR 在 DM 中语义相同',
        autoFixable: true,
      };
    }

    // MySQL ENUM 类型
    if (this.source === 'mysql' && sourceType === 'ENUM') {
      return {
        severity: 'warning',
        category: 'datatype',
        object: tableName,
        column: columnName,
        message: `MySQL ENUM 类型需要转换为 VARCHAR`,
        sourceDefinition: sourceDef,
        targetDefinition: targetDef,
        solution: 'ENUM 将转换为 VARCHAR(255)，建议添加 CHECK 约束验证值',
        autoFixable: true,
      };
    }

    // MySQL JSON 类型
    if (this.source === 'mysql' && sourceType === 'JSON') {
      return {
        severity: 'warning',
        category: 'datatype',
        object: tableName,
        column: columnName,
        message: `MySQL JSON 类型需要转换为 TEXT`,
        sourceDefinition: sourceDef,
        targetDefinition: targetDef,
        solution: 'JSON 将转换为 TEXT，DM 的 JSON 处理函数与 MySQL 不同',
        autoFixable: false,
      };
    }

    return null;
  }

  /**
   * 检查类型是否兼容
   */
  private isTypeCompatible(sourceType: string): boolean {
    // 通用兼容类型
    const compatibleTypes = [
      'CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR',
      'INTEGER', 'INT', 'SMALLINT', 'BIGINT',
      'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC',
      'DATE', 'TIME', 'DATETIME', 'TIMESTAMP',
      'BLOB', 'CLOB', 'TEXT',
      'BINARY', 'VARBINARY',
      'BOOLEAN', 'BIT',
    ];

    return compatibleTypes.includes(sourceType.toUpperCase());
  }

  /**
   * 检查 SQL 语法兼容性
   *
   * @param procedures - 存储过程/函数列表
   * @returns SQL 语法相关的问题列表
   */
  checkSQLSyntax(procedures: ProcedureInfo[]): MigrationIssue[] {
    const issues: MigrationIssue[] = [];
    const rules = getSyntaxRules(this.source);

    for (const proc of procedures) {
      for (const rule of rules) {
        const matches = proc.definition.match(rule.pattern);
        if (matches) {
          issues.push({
            severity: rule.severity,
            category: 'syntax',
            object: proc.name,
            message: `${rule.name}: ${rule.message}`,
            sourceDefinition: matches[0],
            solution: rule.solution,
            autoFixable: rule.autoFixable,
          });
        }
      }

      // 检查空字符串处理差异
      const emptyStringIssues = this.checkEmptyStringHandling(proc.name, proc.definition);
      issues.push(...emptyStringIssues);
    }

    return issues;
  }

  /**
   * 检查空字符串处理差异
   */
  private checkEmptyStringHandling(objectName: string, definition: string): MigrationIssue[] {
    const issues: MigrationIssue[] = [];

    // 检查空字符串比较
    const emptyStringPattern = /(?:=\s*''|''\s*=|IS\s+NULL|NULL\s*!=|!=\s*NULL)/gi;
    const matches = definition.match(emptyStringPattern);

    if (matches && this.source === 'oracle') {
      issues.push({
        severity: 'error',
        category: 'syntax',
        object: objectName,
        message: 'Oracle 空字符串处理差异：Oracle 中 \'\' 等于 NULL，DM 中 \'\' 不等于 NULL',
        sourceDefinition: matches[0],
        solution: '需要检查所有空字符串比较逻辑，必要时修改为显式 NULL 检查',
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
   * 检查对象兼容性
   *
   * @param views - 视图列表
   * @param triggers - 触发器列表
   * @param sequences - 序列列表
   * @returns 对象相关的问题列表
   */
  checkObjects(
    views: ViewInfo[],
    triggers: TriggerInfo[],
    sequences: SequenceInfo[]
  ): MigrationIssue[] {
    const issues: MigrationIssue[] = [];

    // 检查视图兼容性
    for (const view of views) {
      const viewIssues = this.checkViewCompatibility(view);
      issues.push(...viewIssues);
    }

    // 检查触发器兼容性
    for (const trigger of triggers) {
      const triggerIssues = this.checkTriggerCompatibility(trigger);
      issues.push(...triggerIssues);
    }

    // 检查序列兼容性
    for (const sequence of sequences) {
      const sequenceIssues = this.checkSequenceCompatibility(sequence);
      issues.push(...sequenceIssues);
    }

    return issues;
  }

  /**
   * 检查视图兼容性
   */
  private checkViewCompatibility(view: ViewInfo): MigrationIssue[] {
    const issues: MigrationIssue[] = [];

    // 检查视图定义中的语法问题
    const rules = getSyntaxRules(this.source);
    for (const rule of rules) {
      const matches = view.definition.match(rule.pattern);
      if (matches) {
        issues.push({
          severity: rule.severity,
          category: 'object',
          object: view.name,
          message: `视图包含 ${rule.name}: ${rule.message}`,
          sourceDefinition: matches[0],
          solution: rule.solution,
          autoFixable: rule.autoFixable,
        });
      }
    }

    return issues;
  }

  /**
   * 检查触发器兼容性
   */
  private checkTriggerCompatibility(trigger: TriggerInfo): MigrationIssue[] {
    const issues: MigrationIssue[] = [];

    // 检查触发器语法
    if (this.source === 'oracle') {
      // Oracle 触发器 :NEW, :OLD 语法
      if (/:\s*(NEW|OLD)\b/i.test(trigger.definition)) {
        issues.push({
          severity: 'info',
          category: 'object',
          object: trigger.name,
          message: 'Oracle 触发器 :NEW/:OLD 语法在 DM 中兼容',
          solution: 'DM 支持 Oracle 触发器语法，无需修改',
          autoFixable: false,
        });
      }

      // 检查 FOR EACH ROW
      if (/FOR\s+EACH\s+ROW/i.test(trigger.definition)) {
        issues.push({
          severity: 'info',
          category: 'object',
          object: trigger.name,
          message: '行级触发器语法在 DM 中兼容',
          solution: 'DM 支持 FOR EACH ROW 语法',
          autoFixable: false,
        });
      }
    }

    // 检查触发器中的 SQL 语法
    const syntaxIssues = this.checkSQLSyntax([{
      name: trigger.name,
      type: 'procedure',
      definition: trigger.definition,
    }]);
    issues.push(...syntaxIssues);

    return issues;
  }

  /**
   * 检查序列兼容性
   */
  private checkSequenceCompatibility(sequence: SequenceInfo): MigrationIssue[] {
    const issues: MigrationIssue[] = [];

    // DM 序列与 Oracle/MySQL 序列基本兼容
    if (this.source === 'oracle') {
      // Oracle 序列语法在 DM 中基本兼容
      issues.push({
        severity: 'info',
        category: 'object',
        object: sequence.name,
        message: 'Oracle 序列语法在 DM 中基本兼容',
        solution: 'DM 支持 Oracle 序列语法，包括 CYCLE、CACHE 等选项',
        autoFixable: true,
      });
    }

    // 检查序列参数
    if (sequence.cycle) {
      issues.push({
        severity: 'info',
        category: 'object',
        object: sequence.name,
        message: '序列设置了 CYCLE 选项',
        solution: '确认 DM 序列的 CYCLE 行为符合预期',
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
   * 生成迁移建议
   */
  private generateRecommendations(issues: MigrationIssue[]): string[] {
    const recommendations: string[] = [];

    // 统计各类问题数量
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const autoFixableCount = issues.filter(i => i.autoFixable).length;

    if (errorCount > 0) {
      recommendations.push(`发现 ${errorCount} 个错误级别的兼容性问题，必须在迁移前解决`);
    }

    if (warningCount > 0) {
      recommendations.push(`发现 ${warningCount} 个警告级别的兼容性问题，建议在迁移前处理`);
    }

    if (autoFixableCount > 0) {
      recommendations.push(`${autoFixableCount} 个问题可以使用 SQL 转换工具自动修复`);
    }

    // 特定源数据库建议
    if (this.source === 'oracle') {
      recommendations.push('建议启用 DM 的 Oracle 兼容模式以减少语法差异');
      recommendations.push('注意 Oracle 空字符串处理差异，需要检查所有 NULL 相关逻辑');
      recommendations.push('建议使用 dm migrate convert-sql 命令自动转换 SQL 语法');
    }

    if (this.source === 'mysql') {
      recommendations.push('建议检查 MySQL 特有函数（如 GROUP_CONCAT）的替代方案');
      recommendations.push('注意 MySQL ENUM/SET 类型转换后的数据验证');
    }

    return recommendations;
  }

  /**
   * 计算兼容性评分
   *
   * @param issues - 问题列表
   * @param tableCount - 表数量
   * @returns 0-100 的兼容性评分
   */
  private calculateScore(issues: MigrationIssue[], tableCount: number): number {
    if (tableCount === 0) {
      return 100;
    }

    // 问题权重
    const weights = {
      error: 10,
      warning: 5,
      info: 1,
    };

    // 计算问题总分
    const issueScore = issues.reduce((score, issue) => {
      return score + weights[issue.severity];
    }, 0);

    // 计算最大可能分数（假设每个表有 10 个潜在问题）
    const maxScore = tableCount * 10 * weights.error;

    // 计算评分（100 - 问题比例 * 100）
    const score = Math.max(0, Math.round(100 - (issueScore / maxScore) * 100));

    return score;
  }

  /**
   * 生成检查报告
   *
   * @param results - 检查结果
   * @param format - 报告格式
   * @returns 格式化的报告字符串
   */
  generateReport(results: MigrationCheckResult, format: ReportFormat = 'text'): string {
    switch (format) {
      case 'json':
        return this.generateJsonReport(results);
      case 'html':
        return this.generateHtmlReport(results);
      case 'text':
      default:
        return this.generateTextReport(results);
    }
  }

  /**
   * 生成文本格式报告
   */
  private generateTextReport(results: MigrationCheckResult): string {
    const lines: string[] = [];

    // 标题
    lines.push('=== 达梦数据库迁移兼容性检查报告 ===');
    lines.push('');

    // 摘要
    lines.push('【检查摘要】');
    lines.push(`源数据库: ${results.source.toUpperCase()}`);
    lines.push(`目标数据库: ${results.target.toUpperCase()}`);
    lines.push(`表数量: ${results.summary.totalTables}`);
    lines.push(`视图数量: ${results.summary.totalViews}`);
    lines.push(`存储过程数量: ${results.summary.totalProcedures}`);
    lines.push(`函数数量: ${results.summary.totalFunctions}`);
    lines.push(`触发器数量: ${results.summary.totalTriggers}`);
    lines.push(`序列数量: ${results.summary.totalSequences}`);
    lines.push(`兼容性评分: ${results.summary.compatibilityScore}/100`);
    lines.push('');

    // 问题列表
    if (results.issues.length > 0) {
      lines.push('【发现的问题】');
      lines.push('');

      // 按严重级别分组
      const errors = results.issues.filter(i => i.severity === 'error');
      const warnings = results.issues.filter(i => i.severity === 'warning');
      const infos = results.issues.filter(i => i.severity === 'info');

      if (errors.length > 0) {
        lines.push(`错误 (${errors.length}):`);
        errors.forEach((issue, index) => {
          lines.push(`  ${index + 1}. [${issue.object}]${issue.column ? `.${issue.column}` : ''}: ${issue.message}`);
          if (issue.solution) {
            lines.push(`     解决方案: ${issue.solution}`);
          }
        });
        lines.push('');
      }

      if (warnings.length > 0) {
        lines.push(`警告 (${warnings.length}):`);
        warnings.forEach((issue, index) => {
          lines.push(`  ${index + 1}. [${issue.object}]${issue.column ? `.${issue.column}` : ''}: ${issue.message}`);
          if (issue.solution) {
            lines.push(`     解决方案: ${issue.solution}`);
          }
        });
        lines.push('');
      }

      if (infos.length > 0) {
        lines.push(`信息 (${infos.length}):`);
        infos.forEach((issue, index) => {
          lines.push(`  ${index + 1}. [${issue.object}]${issue.column ? `.${issue.column}` : ''}: ${issue.message}`);
        });
        lines.push('');
      }
    } else {
      lines.push('【发现的问题】');
      lines.push('未发现兼容性问题');
      lines.push('');
    }

    // 迁移建议
    if (results.recommendations.length > 0) {
      lines.push('【迁移建议】');
      results.recommendations.forEach((rec, index) => {
        lines.push(`${index + 1}. ${rec}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 生成 JSON 格式报告
   */
  private generateJsonReport(results: MigrationCheckResult): string {
    return JSON.stringify(results, null, 2);
  }

  /**
   * 生成 HTML 格式报告
   */
  private generateHtmlReport(results: MigrationCheckResult): string {
    const errors = results.issues.filter(i => i.severity === 'error');
    const warnings = results.issues.filter(i => i.severity === 'warning');
    const infos = results.issues.filter(i => i.severity === 'info');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>迁移兼容性检查报告</title>
  <style>
    body { font-family: 'Microsoft YaHei', sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
    .score { font-size: 24px; font-weight: bold; color: ${results.summary.compatibilityScore >= 80 ? '#52c41a' : results.summary.compatibilityScore >= 60 ? '#faad14' : '#ff4d4f'}; }
    .issue { margin: 10px 0; padding: 10px; border-left: 4px solid; }
    .error { border-color: #ff4d4f; background: #fff2f0; }
    .warning { border-color: #faad14; background: #fffbe6; }
    .info { border-color: #1890ff; background: #e6f7ff; }
    .issue-header { font-weight: bold; }
    .solution { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>达梦数据库迁移兼容性检查报告</h1>

  <div class="summary">
    <h2>检查摘要</h2>
    <p>源数据库: ${results.source.toUpperCase()} → 目标数据库: ${results.target.toUpperCase()}</p>
    <p>兼容性评分: <span class="score">${results.summary.compatibilityScore}/100</span></p>
    <p>对象统计: ${results.summary.totalTables} 表, ${results.summary.totalViews} 视图, ${results.summary.totalProcedures} 存储过程, ${results.summary.totalFunctions} 函数, ${results.summary.totalTriggers} 触发器, ${results.summary.totalSequences} 序列</p>
  </div>

  <h2>发现的问题</h2>
  ${errors.length > 0 ? `
  <h3>错误 (${errors.length})</h3>
  ${errors.map(issue => `
  <div class="issue error">
    <div class="issue-header">[${issue.object}]${issue.column ? `.${issue.column}` : ''}</div>
    <div>${issue.message}</div>
    ${issue.solution ? `<div class="solution">解决方案: ${issue.solution}</div>` : ''}
  </div>
  `).join('')}
  ` : ''}

  ${warnings.length > 0 ? `
  <h3>警告 (${warnings.length})</h3>
  ${warnings.map(issue => `
  <div class="issue warning">
    <div class="issue-header">[${issue.object}]${issue.column ? `.${issue.column}` : ''}</div>
    <div>${issue.message}</div>
    ${issue.solution ? `<div class="solution">解决方案: ${issue.solution}</div>` : ''}
  </div>
  `).join('')}
  ` : ''}

  ${infos.length > 0 ? `
  <h3>信息 (${infos.length})</h3>
  ${infos.map(issue => `
  <div class="issue info">
    <div class="issue-header">[${issue.object}]${issue.column ? `.${issue.column}` : ''}</div>
    <div>${issue.message}</div>
  </div>
  `).join('')}
  ` : ''}

  <h2>迁移建议</h2>
  <ol>
    ${results.recommendations.map(rec => `<li>${rec}</li>`).join('\n    ')}
  </ol>
</body>
</html>`;
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建迁移检查器实例
 *
 * @param source - 源数据库类型
 * @param target - 目标数据库类型
 * @returns MigrationChecker 实例
 */
export function createMigrationChecker(source: DatabaseType, target: DatabaseType = 'dm'): MigrationChecker {
  return new MigrationChecker(source, target);
}
