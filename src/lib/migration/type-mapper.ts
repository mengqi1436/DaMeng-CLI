/**
 * 数据类型映射器
 *
 * 将各种数据库的数据类型映射为达梦数据库（DM）兼容的类型。
 * 支持的源数据库：
 * - Oracle
 * - MySQL
 * - PostgreSQL
 * - SQL Server
 *
 * 功能：
 * - 精确匹配和模糊匹配
 * - 类型参数转换（如 VARCHAR2(100) → VARCHAR(100)）
 * - 特殊类型处理（如 AUTO_INCREMENT → IDENTITY）
 */

/**
 * 支持的数据库类型
 */
export type DatabaseType = 'oracle' | 'mysql' | 'postgres' | 'sqlserver' | 'dm';

/**
 * 类型映射条目
 */
export interface TypeMapping {
  /** 源数据库类型名称（大写） */
  sourceType: string;
  /** 目标数据库类型名称（大写） */
  targetType: string;
  /** 源类型参数模式（如 "(*,0)" 表示 NUMBER(*,0)） */
  sourceParams?: string;
  /** 目标类型参数（如 "255" 表示 VARCHAR(255)） */
  targetParams?: string;
  /** 转换表达式（可选，用于特殊转换逻辑） */
  conversion?: string;
  /** 备注说明 */
  notes?: string;
}

/**
 * 映射结果
 */
export interface MappingResult {
  /** 映射后的类型名称 */
  type: string;
  /** 映射后的类型参数 */
  params?: string;
  /** 转换表达式（如果需要） */
  conversion?: string;
  /** 备注说明 */
  notes?: string;
  /** 是否为精确匹配 */
  exactMatch: boolean;
}

/**
 * Oracle → DM 数据类型映射
 */
export const ORACLE_TO_DM_TYPES: TypeMapping[] = [
  // 数值类型
  { sourceType: 'NUMBER', targetType: 'NUMERIC' },
  { sourceType: 'NUMBER', targetType: 'INTEGER', sourceParams: '(*,0)', notes: '整数类型' },
  { sourceType: 'NUMBER', targetType: 'BIGINT', sourceParams: '(*,0)', notes: '大整数' },
  { sourceType: 'NUMBER', targetType: 'SMALLINT', sourceParams: '(*,0)', notes: '小整数' },
  { sourceType: 'FLOAT', targetType: 'DOUBLE' },
  { sourceType: 'BINARY_FLOAT', targetType: 'FLOAT' },
  { sourceType: 'BINARY_DOUBLE', targetType: 'DOUBLE' },
  { sourceType: 'INTEGER', targetType: 'INTEGER' },
  { sourceType: 'SMALLINT', targetType: 'SMALLINT' },

  // 字符类型
  { sourceType: 'VARCHAR2', targetType: 'VARCHAR' },
  { sourceType: 'NVARCHAR2', targetType: 'NVARCHAR' },
  { sourceType: 'CHAR', targetType: 'CHAR' },
  { sourceType: 'NCHAR', targetType: 'NCHAR' },

  // 大对象类型
  { sourceType: 'CLOB', targetType: 'CLOB' },
  { sourceType: 'NCLOB', targetType: 'TEXT' },
  { sourceType: 'BLOB', targetType: 'BLOB' },
  { sourceType: 'LONG', targetType: 'TEXT', notes: 'Oracle LONG 类型映射为 TEXT' },
  { sourceType: 'LONG RAW', targetType: 'BLOB', notes: 'Oracle LONG RAW 映射为 BLOB' },

  // 日期时间类型
  { sourceType: 'DATE', targetType: 'DATETIME' },
  { sourceType: 'TIMESTAMP', targetType: 'TIMESTAMP' },
  { sourceType: 'TIMESTAMP WITH TIME ZONE', targetType: 'TIMESTAMP WITH TIME ZONE' },
  { sourceType: 'TIMESTAMP WITH LOCAL TIME ZONE', targetType: 'TIMESTAMP WITH LOCAL TIME ZONE' },
  { sourceType: 'INTERVAL YEAR TO MONTH', targetType: 'VARCHAR', targetParams: '20', notes: 'DM 不支持 INTERVAL 类型' },
  { sourceType: 'INTERVAL DAY TO SECOND', targetType: 'VARCHAR', targetParams: '20', notes: 'DM 不支持 INTERVAL 类型' },

  // 二进制类型
  { sourceType: 'RAW', targetType: 'VARBINARY' },
  { sourceType: 'ROWID', targetType: 'VARCHAR', targetParams: '18' },

  // 其他类型
  { sourceType: 'XMLTYPE', targetType: 'TEXT', notes: 'DM 不原生支持 XMLTYPE' },
  { sourceType: 'SDO_GEOMETRY', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'JSON', targetType: 'TEXT', notes: 'Oracle 12c+ JSON 类型' },
];

/**
 * MySQL → DM 数据类型映射
 */
export const MYSQL_TO_DM_TYPES: TypeMapping[] = [
  // 整数类型
  { sourceType: 'TINYINT', targetType: 'SMALLINT' },
  { sourceType: 'SMALLINT', targetType: 'SMALLINT' },
  { sourceType: 'MEDIUMINT', targetType: 'INTEGER' },
  { sourceType: 'INT', targetType: 'INTEGER' },
  { sourceType: 'BIGINT', targetType: 'BIGINT' },
  { sourceType: 'INT AUTO_INCREMENT', targetType: 'INTEGER IDENTITY(1,1)', notes: '自增主键' },
  { sourceType: 'BIGINT AUTO_INCREMENT', targetType: 'BIGINT IDENTITY(1,1)', notes: '自增主键' },

  // 浮点类型
  { sourceType: 'FLOAT', targetType: 'FLOAT' },
  { sourceType: 'DOUBLE', targetType: 'DOUBLE' },
  { sourceType: 'DECIMAL', targetType: 'DECIMAL' },
  { sourceType: 'NUMERIC', targetType: 'NUMERIC' },

  // 字符类型
  { sourceType: 'CHAR', targetType: 'CHAR' },
  { sourceType: 'VARCHAR', targetType: 'VARCHAR' },
  { sourceType: 'TINYTEXT', targetType: 'VARCHAR', targetParams: '255' },
  { sourceType: 'TEXT', targetType: 'TEXT' },
  { sourceType: 'MEDIUMTEXT', targetType: 'CLOB' },
  { sourceType: 'LONGTEXT', targetType: 'CLOB' },

  // 二进制类型
  { sourceType: 'BINARY', targetType: 'BINARY' },
  { sourceType: 'VARBINARY', targetType: 'VARBINARY' },
  { sourceType: 'TINYBLOB', targetType: 'BLOB' },
  { sourceType: 'BLOB', targetType: 'BLOB' },
  { sourceType: 'MEDIUMBLOB', targetType: 'BLOB' },
  { sourceType: 'LONGBLOB', targetType: 'BLOB' },

  // 日期时间类型
  { sourceType: 'DATE', targetType: 'DATE' },
  { sourceType: 'TIME', targetType: 'TIME' },
  { sourceType: 'DATETIME', targetType: 'DATETIME' },
  { sourceType: 'TIMESTAMP', targetType: 'TIMESTAMP' },
  { sourceType: 'YEAR', targetType: 'SMALLINT', notes: 'MySQL YEAR 类型映射为 SMALLINT' },

  // 枚举和集合
  { sourceType: 'ENUM', targetType: 'VARCHAR', targetParams: '255', notes: 'DM 不支持 ENUM' },
  { sourceType: 'SET', targetType: 'VARCHAR', targetParams: '255', notes: 'DM 不支持 SET' },

  // JSON 类型
  { sourceType: 'JSON', targetType: 'TEXT', notes: 'DM 不原生支持 JSON 类型' },

  // 布尔类型
  { sourceType: 'BOOLEAN', targetType: 'BIT', notes: '或使用 TINYINT' },
  { sourceType: 'BOOL', targetType: 'BIT', notes: 'BOOLEAN 的别名' },
  { sourceType: 'BIT', targetType: 'BIT' },

  // 空间类型
  { sourceType: 'GEOMETRY', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'POINT', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'LINESTRING', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'POLYGON', targetType: 'TEXT', notes: '空间类型需特殊处理' },
];

/**
 * PostgreSQL → DM 数据类型映射
 */
export const POSTGRES_TO_DM_TYPES: TypeMapping[] = [
  // 整数类型
  { sourceType: 'SMALLINT', targetType: 'SMALLINT' },
  { sourceType: 'INT', targetType: 'INTEGER' },
  { sourceType: 'INTEGER', targetType: 'INTEGER' },
  { sourceType: 'BIGINT', targetType: 'BIGINT' },
  { sourceType: 'SERIAL', targetType: 'INTEGER IDENTITY(1,1)', notes: '自增序列' },
  { sourceType: 'SMALLSERIAL', targetType: 'SMALLINT IDENTITY(1,1)', notes: '自增序列' },
  { sourceType: 'BIGSERIAL', targetType: 'BIGINT IDENTITY(1,1)', notes: '自增序列' },

  // 浮点类型
  { sourceType: 'REAL', targetType: 'FLOAT' },
  { sourceType: 'FLOAT4', targetType: 'FLOAT' },
  { sourceType: 'DOUBLE PRECISION', targetType: 'DOUBLE' },
  { sourceType: 'FLOAT8', targetType: 'DOUBLE' },
  { sourceType: 'NUMERIC', targetType: 'NUMERIC' },
  { sourceType: 'DECIMAL', targetType: 'DECIMAL' },

  // 字符类型
  { sourceType: 'CHAR', targetType: 'CHAR' },
  { sourceType: 'CHARACTER', targetType: 'CHAR' },
  { sourceType: 'VARCHAR', targetType: 'VARCHAR' },
  { sourceType: 'CHARACTER VARYING', targetType: 'VARCHAR' },
  { sourceType: 'TEXT', targetType: 'TEXT' },

  // 二进制类型
  { sourceType: 'BYTEA', targetType: 'BLOB', notes: 'PostgreSQL BYTEA 映射为 BLOB' },

  // 日期时间类型
  { sourceType: 'DATE', targetType: 'DATE' },
  { sourceType: 'TIME', targetType: 'TIME' },
  { sourceType: 'TIME WITHOUT TIME ZONE', targetType: 'TIME' },
  { sourceType: 'TIME WITH TIME ZONE', targetType: 'TIME' },
  { sourceType: 'TIMESTAMP', targetType: 'TIMESTAMP' },
  { sourceType: 'TIMESTAMP WITHOUT TIME ZONE', targetType: 'TIMESTAMP' },
  { sourceType: 'TIMESTAMP WITH TIME ZONE', targetType: 'TIMESTAMP WITH TIME ZONE' },
  { sourceType: 'INTERVAL', targetType: 'VARCHAR', targetParams: '20', notes: 'DM 不支持 INTERVAL' },

  // 布尔类型
  { sourceType: 'BOOLEAN', targetType: 'BIT', notes: '或使用 TINYINT' },
  { sourceType: 'BOOL', targetType: 'BIT' },

  // UUID 类型
  { sourceType: 'UUID', targetType: 'VARCHAR', targetParams: '36', notes: 'DM 不支持 UUID 类型' },

  // JSON 类型
  { sourceType: 'JSON', targetType: 'TEXT' },
  { sourceType: 'JSONB', targetType: 'TEXT', notes: 'JSONB 二进制格式' },

  // 数组类型
  { sourceType: 'ARRAY', targetType: 'TEXT', notes: 'DM 不支持数组类型，需应用层处理' },

  // 网络地址类型
  { sourceType: 'INET', targetType: 'VARCHAR', targetParams: '45' },
  { sourceType: 'CIDR', targetType: 'VARCHAR', targetParams: '45' },
  { sourceType: 'MACADDR', targetType: 'VARCHAR', targetParams: '17' },

  // 几何类型
  { sourceType: 'POINT', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'LINE', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'LSEG', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'BOX', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'PATH', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'POLYGON', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'CIRCLE', targetType: 'TEXT', notes: '空间类型需特殊处理' },

  // 范围类型
  { sourceType: 'INT4RANGE', targetType: 'VARCHAR', targetParams: '50', notes: 'DM 不支持范围类型' },
  { sourceType: 'INT8RANGE', targetType: 'VARCHAR', targetParams: '50' },
  { sourceType: 'NUMRANGE', targetType: 'VARCHAR', targetParams: '50' },
  { sourceType: 'TSRANGE', targetType: 'VARCHAR', targetParams: '50' },
  { sourceType: 'TSTZRANGE', targetType: 'VARCHAR', targetParams: '50' },
  { sourceType: 'DATERANGE', targetType: 'VARCHAR', targetParams: '50' },

  // XML 类型
  { sourceType: 'XML', targetType: 'TEXT', notes: 'DM 不原生支持 XML 类型' },
];

/**
 * SQL Server → DM 数据类型映射
 */
export const SQLSERVER_TO_DM_TYPES: TypeMapping[] = [
  // 整数类型
  { sourceType: 'TINYINT', targetType: 'SMALLINT' },
  { sourceType: 'SMALLINT', targetType: 'SMALLINT' },
  { sourceType: 'INT', targetType: 'INTEGER' },
  { sourceType: 'BIGINT', targetType: 'BIGINT' },

  // 浮点类型
  { sourceType: 'REAL', targetType: 'FLOAT' },
  { sourceType: 'FLOAT', targetType: 'DOUBLE' },
  { sourceType: 'DECIMAL', targetType: 'DECIMAL' },
  { sourceType: 'NUMERIC', targetType: 'NUMERIC' },
  { sourceType: 'MONEY', targetType: 'DECIMAL', targetParams: '19,4', notes: 'SQL Server MONEY 映射为 DECIMAL(19,4)' },
  { sourceType: 'SMALLMONEY', targetType: 'DECIMAL', targetParams: '10,4', notes: 'SQL Server SMALLMONEY 映射为 DECIMAL(10,4)' },

  // 字符类型
  { sourceType: 'CHAR', targetType: 'CHAR' },
  { sourceType: 'VARCHAR', targetType: 'VARCHAR' },
  { sourceType: 'TEXT', targetType: 'TEXT' },
  { sourceType: 'NCHAR', targetType: 'NCHAR' },
  { sourceType: 'NVARCHAR', targetType: 'NVARCHAR' },
  { sourceType: 'NTEXT', targetType: 'TEXT', notes: 'SQL Server NTEXT 已弃用，映射为 TEXT' },

  // 二进制类型
  { sourceType: 'BINARY', targetType: 'BINARY' },
  { sourceType: 'VARBINARY', targetType: 'VARBINARY' },
  { sourceType: 'IMAGE', targetType: 'BLOB', notes: 'SQL Server IMAGE 已弃用，映射为 BLOB' },

  // 日期时间类型
  { sourceType: 'DATE', targetType: 'DATE' },
  { sourceType: 'TIME', targetType: 'TIME' },
  { sourceType: 'DATETIME', targetType: 'DATETIME' },
  { sourceType: 'DATETIME2', targetType: 'DATETIME' },
  { sourceType: 'SMALLDATETIME', targetType: 'DATETIME' },
  { sourceType: 'TIMESTAMP', targetType: 'BINARY', targetParams: '8', notes: 'SQL Server TIMESTAMP 是行版本，非时间戳' },
  { sourceType: 'ROWVERSION', targetType: 'BINARY', targetParams: '8', notes: 'SQL Server ROWVERSION 是行版本' },
  { sourceType: 'DATETIMEOFFSET', targetType: 'TIMESTAMP WITH TIME ZONE' },

  // 布尔类型
  { sourceType: 'BIT', targetType: 'BIT' },

  // 唯一标识符
  { sourceType: 'UNIQUEIDENTIFIER', targetType: 'VARCHAR', targetParams: '36', notes: 'DM 不支持 UNIQUEIDENTIFIER' },

  // XML 类型
  { sourceType: 'XML', targetType: 'TEXT', notes: 'DM 不原生支持 XML 类型' },

  // 空间类型
  { sourceType: 'GEOMETRY', targetType: 'TEXT', notes: '空间类型需特殊处理' },
  { sourceType: 'GEOGRAPHY', targetType: 'TEXT', notes: '空间类型需特殊处理' },

  // 层次结构类型
  { sourceType: 'HIERARCHYID', targetType: 'VARCHAR', targetParams: '892', notes: 'SQL Server 特有类型' },

  // 表类型（无法直接映射）
  { sourceType: 'TABLE', targetType: 'TEXT', notes: 'SQL Server 表类型无法直接映射' },
  { sourceType: 'SQL_VARIANT', targetType: 'TEXT', notes: 'SQL Server SQL_VARIANT 无法直接映射' },
];

/**
 * 数据类型映射器类
 *
 * 提供从各种数据库类型到 DM 类型的映射功能。
 *
 * @example
 * ```typescript
 * const mapper = new TypeMapper('oracle', 'dm');
 * const result = mapper.mapType('VARCHAR2', '100');
 * // { type: 'VARCHAR', params: '100', exactMatch: false }
 * ```
 */
export class TypeMapper {
  /** 映射规则列表 */
  private mappings: TypeMapping[];

  /** 源数据库类型 */
  private sourceType: DatabaseType;

  /** 目标数据库类型 */
  private targetType: DatabaseType;

  /**
   * 创建类型映射器实例
   *
   * @param sourceType - 源数据库类型
   * @param targetType - 目标数据库类型（默认为 'dm'）
   */
  constructor(sourceType: DatabaseType, targetType: DatabaseType = 'dm') {
    this.sourceType = sourceType;
    this.targetType = targetType;
    this.mappings = this.getMappings(sourceType, targetType);
  }

  /**
   * 获取指定数据库类型组合的映射规则
   *
   * @param sourceType - 源数据库类型
   * @param targetType - 目标数据库类型
   * @returns 映射规则列表
   */
  getMappings(sourceType: DatabaseType, targetType: DatabaseType = 'dm'): TypeMapping[] {
    // 目前只支持映射到 DM
    if (targetType !== 'dm') {
      throw new Error(`暂不支持映射到 ${targetType}，目前仅支持映射到 dm`);
    }

    switch (sourceType) {
      case 'oracle':
        return [...ORACLE_TO_DM_TYPES];
      case 'mysql':
        return [...MYSQL_TO_DM_TYPES];
      case 'postgres':
        return [...POSTGRES_TO_DM_TYPES];
      case 'sqlserver':
        return [...SQLSERVER_TO_DM_TYPES];
      case 'dm':
        // DM 到 DM，返回空映射（无需转换）
        return [];
      default:
        throw new Error(`不支持的源数据库类型: ${sourceType}`);
    }
  }

  /**
   * 映射数据类型
   *
   * 按以下优先级匹配：
   * 1. 精确匹配（类型和参数都匹配）
   * 2. 模糊匹配（仅类型匹配，保留原参数）
   * 3. 未知类型（返回原类型并标记）
   *
   * @param sourceType - 源数据类型名称（如 'VARCHAR2'、'NUMBER'）
   * @param sourceParams - 源类型参数（如 '100'、'(*,0)'）
   * @returns 映射结果
   *
   * @example
   * ```typescript
   * const mapper = new TypeMapper('oracle');
   *
   * // 精确匹配
   * mapper.mapType('NUMBER', '(*,0)');
   * // { type: 'INTEGER', params: undefined, exactMatch: true, notes: '整数类型' }
   *
   * // 模糊匹配（保留原参数）
   * mapper.mapType('VARCHAR2', '100');
   * // { type: 'VARCHAR', params: '100', exactMatch: false }
   *
   * // 未知类型
   * mapper.mapType('UNKNOWN_TYPE');
   * // { type: 'UNKNOWN_TYPE', params: undefined, exactMatch: false }
   * ```
   */
  mapType(sourceType: string, sourceParams?: string): MappingResult {
    const normalizedType = sourceType.toUpperCase().trim();

    // 1. 尝试精确匹配（类型 + 参数）
    if (sourceParams) {
      const normalizedParams = sourceParams.toUpperCase().trim();
      const exactMatch = this.mappings.find(
        (m) =>
          m.sourceType === normalizedType &&
          m.sourceParams &&
          this.matchParams(m.sourceParams, normalizedParams)
      );

      if (exactMatch) {
        return {
          type: exactMatch.targetType,
          params: exactMatch.targetParams,
          conversion: exactMatch.conversion,
          notes: exactMatch.notes,
          exactMatch: true,
        };
      }
    }

    // 2. 尝试模糊匹配（仅类型）
    const fuzzyMatch = this.mappings.find(
      (m) => m.sourceType === normalizedType && !m.sourceParams
    );

    if (fuzzyMatch) {
      return {
        type: fuzzyMatch.targetType,
        params: fuzzyMatch.targetParams || sourceParams,
        conversion: fuzzyMatch.conversion,
        notes: fuzzyMatch.notes,
        exactMatch: false,
      };
    }

    // 3. 尝试带默认参数的匹配
    const defaultMatch = this.mappings.find(
      (m) => m.sourceType === normalizedType
    );

    if (defaultMatch) {
      return {
        type: defaultMatch.targetType,
        params: defaultMatch.targetParams || sourceParams,
        conversion: defaultMatch.conversion,
        notes: defaultMatch.notes,
        exactMatch: false,
      };
    }

    // 4. 未知类型，返回原类型并标记
    return {
      type: normalizedType,
      params: sourceParams,
      exactMatch: false,
      notes: `未知类型 ${normalizedType}，未找到映射规则`,
    };
  }

  /**
   * 批量映射多个类型
   *
   * @param types - 类型列表，每个元素为 [类型名, 参数?]
   * @returns 映射结果列表
   */
  mapTypes(types: Array<[string, string?]>): MappingResult[] {
    return types.map(([type, params]) => this.mapType(type, params));
  }

  /**
   * 检查类型是否需要特殊处理
   *
   * @param sourceType - 源数据类型名称
   * @returns 是否需要特殊处理
   */
  needsSpecialHandling(sourceType: string): boolean {
    const normalizedType = sourceType.toUpperCase().trim();
    const mapping = this.mappings.find((m) => m.sourceType === normalizedType);
    return !!mapping?.notes;
  }

  /**
   * 获取所有映射规则
   *
   * @returns 映射规则列表的副本
   */
  getAllMappings(): TypeMapping[] {
    return [...this.mappings];
  }

  /**
   * 获取源数据库类型
   */
  getSourceType(): DatabaseType {
    return this.sourceType;
  }

  /**
   * 获取目标数据库类型
   */
  getTargetType(): DatabaseType {
    return this.targetType;
  }

  /**
   * 匹配参数模式
   *
   * 支持通配符 * 的匹配，例如：
   * - '(*,0)' 匹配 '(10,0)'、'(*,0)'
   * - '(100)' 匹配 '(100)'
   *
   * @param pattern - 参数模式
   * @param actual - 实际参数
   * @returns 是否匹配
   */
  private matchParams(pattern: string, actual: string): boolean {
    // 如果模式包含通配符 *
    if (pattern.includes('*')) {
      // 将模式转换为正则表达式
      const regexStr = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
        .replace('\\*', '[\\d\\*]*'); // 将转义的 * 替换为数字或 * 的匹配
      const regex = new RegExp(`^${regexStr}$`, 'i');
      return regex.test(actual);
    }

    // 精确匹配
    return pattern === actual;
  }
}

/**
 * 创建类型映射器实例
 *
 * @param sourceType - 源数据库类型
 * @param targetType - 目标数据库类型（默认为 'dm'）
 * @returns TypeMapper 实例
 *
 * @example
 * ```typescript
 * const oracleMapper = createTypeMapper('oracle');
 * const mysqlMapper = createTypeMapper('mysql');
 * const pgMapper = createTypeMapper('postgres');
 * const mssqlMapper = createTypeMapper('sqlserver');
 * ```
 */
export function createTypeMapper(
  sourceType: DatabaseType,
  targetType: DatabaseType = 'dm'
): TypeMapper {
  return new TypeMapper(sourceType, targetType);
}

/**
 * 快速映射类型（无需创建实例）
 *
 * @param sourceType - 源数据库类型
 * @param typeName - 要映射的类型名称
 * @param typeParams - 类型参数（可选）
 * @returns 映射后的类型名称（包含参数）
 *
 * @example
 * ```typescript
 * const result = quickMapType('oracle', 'VARCHAR2', '100');
 * // 'VARCHAR(100)'
 * ```
 */
export function quickMapType(
  sourceType: DatabaseType,
  typeName: string,
  typeParams?: string
): string {
  const mapper = createTypeMapper(sourceType);
  const result = mapper.mapType(typeName, typeParams);

  if (result.params) {
    return `${result.type}(${result.params})`;
  }
  return result.type;
}
