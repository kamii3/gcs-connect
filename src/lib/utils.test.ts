import { describe, it, expect } from 'vitest';
import { cn, formatChatTime, formatBytes } from './utils';

describe('Utility Functions', () => {
  describe('cn (Tailwind Class Merger)', () => {
    it('merges class names correctly', () => {
      const result = cn('bg-gcs-bg', 'text-gcs-text', true && 'p-4');
      expect(result).toBe('bg-gcs-bg text-gcs-text p-4');
    });

    it('resolves conflicting tailwind classes with precedence to last', () => {
      const result = cn('p-2', 'p-4');
      expect(result).toBe('p-4');
    });

    it('ignores falsy, null, and undefined values', () => {
      const result = cn('btn', false && 'hidden', null, undefined, 'active');
      expect(result).toBe('btn active');
    });
  });

  describe('formatChatTime', () => {
    it('formats today timestamps as hours and minutes', () => {
      const now = new Date();
      const formatted = formatChatTime(now);
      expect(formatted).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)?/i);
    });

    it('returns "Yesterday" for dates 24 hours ago', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const formatted = formatChatTime(yesterday);
      expect(formatted).toBe('Yesterday');
    });

    it('handles invalid dates gracefully', () => {
      expect(formatChatTime('invalid-date')).toBe('');
    });
  });

  describe('formatBytes', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('formats kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });

    it('formats gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.2 GB');
    });
  });
});
