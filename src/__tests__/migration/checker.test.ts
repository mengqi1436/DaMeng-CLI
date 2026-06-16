/**
 * 迁移兼容性检查器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MigrationChecker,
  createMigrationChecker,
  type TableInfo,
  type ProcedureInfo,
  type ViewInfo,
  type TriggerInfo,
  type SequenceInfo,
  type MigrationCheckResult,
} from '../../lib/migration/checker';

describe('MigrationChecker', () => {
  let checker: MigrationChecker;

  beforeEach(() => {
    checker = createMigrationChecker('oracle', 'dm');
  });

  describe('checkDataTypes', () => {
    it('should detect Oracle NUMBER type conversion', () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'NUMBER', typeParams: '10,0', nullable: false },
            { name: 'balance', dataType: 'NUMBER', typeParams: '10,2', nullable: true },
          ],
        },
      ];

      const issues = checker.checkDataTypes(tables);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.column === 'id' && i.message.includes('NUMBER'))).toBe(true);
    });

    it('should detect Oracle VARCHAR2 type conversion', () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'name', dataType: 'VARCHAR2', typeParams: '100', nullable: true },
          ],
        },
      ];

      const issues = checker.checkDataTypes(tables);
      expect(issues.some(i => i.column === 'name' && i.message.includes('VARCHAR2'))).toBe(true);
    });

    it('should detect unsupported types', () => {
      const tables: TableInfo[] = [
        {
          name: 'spatial_data',
          columns: [
            { name: 'geometry', dataType: 'UNKNOWN_TYPE_12345', nullable: true },
          ],
        },
      ];

      const issues = checker.checkDataTypes(tables);
      expect(issues.some(i => i.severity === 'error' && i.message.includes('无对应类型'))).toBe(true);
    });
  });

  describe('checkSQLSyntax', () => {
    it('should detect ROWNUM syntax', () => {
      const procedures: ProcedureInfo[] = [
        {
          name: 'get_users',
          type: 'procedure',
          definition: 'SELECT * FROM users WHERE ROWNUM <= 10',
        },
      ];

      const issues = checker.checkSQLSyntax(procedures);
      expect(issues.some(i => i.message.includes('ROWNUM'))).toBe(true);
    });

    it('should detect DECODE function', () => {
      const procedures: ProcedureInfo[] = [
        {
          name: 'format_status',
          type: 'function',
          definition: 'RETURN DECODE(status, 1, \'active\', 0, \'inactive\', \'unknown\')',
        },
      ];

      const issues = checker.checkSQLSyntax(procedures);
      expect(issues.some(i => i.message.includes('DECODE'))).toBe(true);
    });

    it('should detect NVL function', () => {
      const procedures: ProcedureInfo[] = [
        {
          name: 'get_name',
          type: 'function',
          definition: 'RETURN NVL(name, \'unknown\')',
        },
      ];

      const issues = checker.checkSQLSyntax(procedures);
      expect(issues.some(i => i.message.includes('NVL'))).toBe(true);
    });

    it('should detect empty string comparison', () => {
      const procedures: ProcedureInfo[] = [
        {
          name: 'check_empty',
          type: 'procedure',
          definition: 'SELECT * FROM users WHERE name = \'\'',
        },
      ];

      const issues = checker.checkSQLSyntax(procedures);
      expect(issues.some(i => i.severity === 'error' && i.message.includes('空字符串'))).toBe(true);
    });
  });

  describe('checkObjects', () => {
    it('should check view compatibility', () => {
      const views: ViewInfo[] = [
        {
          name: 'active_users',
          definition: 'SELECT * FROM users WHERE status = 1 AND ROWNUM <= 100',
        },
      ];

      const issues = checker.checkObjects(views, [], []);
      expect(issues.some(i => i.object === 'active_users' && i.message.includes('ROWNUM'))).toBe(true);
    });

    it('should check trigger compatibility', () => {
      const triggers: TriggerInfo[] = [
        {
          name: 'audit_trigger',
          event: 'INSERT',
          timing: 'BEFORE',
          definition: 'BEGIN :NEW.created_at := SYSDATE; END;',
          tableName: 'users',
        },
      ];

      const issues = checker.checkObjects([], triggers, []);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should check sequence compatibility', () => {
      const sequences: SequenceInfo[] = [
        {
          name: 'user_id_seq',
          startValue: 1,
          increment: 1,
          cycle: false,
        },
      ];

      const issues = checker.checkObjects([], [], sequences);
      expect(issues.some(i => i.object === 'user_id_seq')).toBe(true);
    });
  });

  describe('checkCompatibility', () => {
    it('should perform full compatibility check', async () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'NUMBER', typeParams: '10,0', nullable: false },
            { name: 'name', dataType: 'VARCHAR2', typeParams: '100', nullable: true },
          ],
        },
      ];

      const procedures: ProcedureInfo[] = [
        {
          name: 'get_user',
          type: 'procedure',
          definition: 'SELECT * FROM users WHERE id = p_id AND ROWNUM <= 1',
        },
      ];

      const result = await checker.checkCompatibility(tables, procedures);

      expect(result.source).toBe('oracle');
      expect(result.target).toBe('dm');
      expect(result.summary.totalTables).toBe(1);
      expect(result.summary.totalProcedures).toBe(1);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.summary.compatibilityScore).toBeGreaterThanOrEqual(0);
      expect(result.summary.compatibilityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('generateReport', () => {
    it('should generate text report', async () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'NUMBER', nullable: false },
          ],
        },
      ];

      const result = await checker.checkCompatibility(tables);
      const report = checker.generateReport(result, 'text');

      expect(report).toContain('迁移兼容性检查报告');
      expect(report).toContain('ORACLE');
      expect(report).toContain('DM');
    });

    it('should generate JSON report', async () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'NUMBER', nullable: false },
          ],
        },
      ];

      const result = await checker.checkCompatibility(tables);
      const report = checker.generateReport(result, 'json');

      const parsed = JSON.parse(report);
      expect(parsed.source).toBe('oracle');
      expect(parsed.target).toBe('dm');
    });

    it('should generate HTML report', async () => {
      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'NUMBER', nullable: false },
          ],
        },
      ];

      const result = await checker.checkCompatibility(tables);
      const report = checker.generateReport(result, 'html');

      expect(report).toContain('<!DOCTYPE html>');
      expect(report).toContain('迁移兼容性检查报告');
    });
  });

  describe('MySQL source', () => {
    it('should check MySQL compatibility', async () => {
      const mysqlChecker = createMigrationChecker('mysql', 'dm');

      const tables: TableInfo[] = [
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'INT', typeParams: undefined, nullable: false },
            { name: 'status', dataType: 'ENUM', typeParams: '\'active\',\'inactive\'', nullable: true },
          ],
        },
      ];

      const procedures: ProcedureInfo[] = [
        {
          name: 'get_user',
          type: 'procedure',
          definition: 'SELECT IFNULL(name, \'unknown\') FROM users WHERE id = p_id',
        },
      ];

      const result = await mysqlChecker.checkCompatibility(tables, procedures);

      expect(result.source).toBe('mysql');
      expect(result.issues.some(i => i.message.includes('ENUM'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('IFNULL'))).toBe(true);
    });
  });
});
