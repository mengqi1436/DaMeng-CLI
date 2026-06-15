import { describe, it, expect } from 'vitest';
import { Formatter, createFormatter, formatQueryResult } from '../lib/formatter';

describe('Formatter', () => {
  describe('createFormatter', () => {
    it('should create formatter with default options', () => {
      const formatter = createFormatter();
      expect(formatter).toBeInstanceOf(Formatter);
    });

    it('should create formatter with custom options', () => {
      const formatter = createFormatter({ format: 'json', maxRows: 100 });
      expect(formatter).toBeInstanceOf(Formatter);
    });
  });

  describe('formatQueryResult', () => {
    it('should format result as table', () => {
      const result = {
        columns: ['id', 'name'],
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      };
      const output = formatQueryResult(result);
      expect(output).toContain('id');
      expect(output).toContain('name');
      expect(output).toContain('Alice');
      expect(output).toContain('Bob');
    });

    it('should format result as JSON', () => {
      const result = {
        columns: ['id', 'name'],
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      };
      const output = formatQueryResult(result, { format: 'json' });
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ id: 1, name: 'Alice' });
    });

    it('should format result as CSV', () => {
      const result = {
        columns: ['id', 'name'],
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      };
      const output = formatQueryResult(result, { format: 'csv' });
      expect(output).toContain('id,name');
      expect(output).toContain('1,Alice');
      expect(output).toContain('2,Bob');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(Formatter.formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(Formatter.formatDuration(1500)).toBe('1.50s');
    });
  });

  describe('formatRowCount', () => {
    it('should format displayed rows only', () => {
      expect(Formatter.formatRowCount(10)).toBe('共 10 行');
    });

    it('should format displayed and total rows', () => {
      expect(Formatter.formatRowCount(10, 100)).toBe('显示 10 行，共 100 行');
    });
  });
});
