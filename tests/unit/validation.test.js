/**
 * Unit tests for validation utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationUtils } from '../../src/utils/validation.js';

describe('ValidationUtils', () => {
  describe('validateFileData', () => {
    it('should return null for valid file data', () => {
      const validData = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;
      
      const result = ValidationUtils.validateFileData(validData);
      expect(result).toBeNull();
    });

    it('should return error message for empty data', () => {
      const result = ValidationUtils.validateFileData('');
      expect(result).toBe('No data received from MakeMKV');
    });

    it('should return error message for null data', () => {
      const result = ValidationUtils.validateFileData(null);
      expect(result).toBe('No data received from MakeMKV');
    });

    it('should return error message for undefined data', () => {
      const result = ValidationUtils.validateFileData(undefined);
      expect(result).toBe('No data received from MakeMKV');
    });

    it('should return error message for single line data', () => {
      const result = ValidationUtils.validateFileData('Single line only');
      expect(result).toBe('Invalid MakeMKV output format');
    });

    it('should handle data with only newlines', () => {
      const result = ValidationUtils.validateFileData('\n');
      expect(result).toBe('Invalid MakeMKV output format');
    });
  });

  describe('validateDriveData', () => {
    it('should return null for valid drive data', () => {
      const validData = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Movie Title","/dev/sr0"
DRV:1,0,999,0,"","",""`;
      
      const result = ValidationUtils.validateDriveData(validData);
      expect(result).toBeNull();
    });

    it('should return error message for empty data', () => {
      const result = ValidationUtils.validateDriveData('');
      expect(result).toBe('No drive data received from MakeMKV');
    });

    it('should return error message for null data', () => {
      const result = ValidationUtils.validateDriveData(null);
      expect(result).toBe('No drive data received from MakeMKV');
    });

    it('should return error message for undefined data', () => {
      const result = ValidationUtils.validateDriveData(undefined);
      expect(result).toBe('No drive data received from MakeMKV');
    });

    it('should return error message for single line data', () => {
      const result = ValidationUtils.validateDriveData('Single line only');
      expect(result).toBe('Invalid MakeMKV drive output format');
    });

    it('should handle complex drive data', () => {
      const complexData = `DRV:0,2,999,1,"BD-ROM PIONEER BD-RW   BDR-211DBK 1.40d","MOVIE_TITLE_DISC1","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","TV_SHOW_SEASON1_DISC2","/dev/sr1"
DRV:2,0,999,0,"","",""`;
      
      const result = ValidationUtils.validateDriveData(complexData);
      expect(result).toBeNull();
    });
  });

  describe('getTimeInSeconds', () => {
    it('should convert hours, minutes, seconds to total seconds', () => {
      const timeArray = ['1', '23', '45']; // 1:23:45
      const expected = 1 * 3600 + 23 * 60 + 45; // 5025 seconds
      
      const result = ValidationUtils.getTimeInSeconds(timeArray);
      expect(result).toBe(expected);
    });

    it('should handle zero values', () => {
      const timeArray = ['0', '0', '0'];
      const result = ValidationUtils.getTimeInSeconds(timeArray);
      expect(result).toBe(0);
    });

    it('should handle large time values', () => {
      const timeArray = ['2', '59', '59']; // 2:59:59
      const expected = 2 * 3600 + 59 * 60 + 59; // 10799 seconds
      
      const result = ValidationUtils.getTimeInSeconds(timeArray);
      expect(result).toBe(expected);
    });

    it('should handle string numbers correctly', () => {
      const timeArray = ['12', '34', '56'];
      const expected = 12 * 3600 + 34 * 60 + 56; // 45296 seconds
      
      const result = ValidationUtils.getTimeInSeconds(timeArray);
      expect(result).toBe(expected);
    });

    it('should handle single digit values', () => {
      const timeArray = ['1', '2', '3'];
      const expected = 1 * 3600 + 2 * 60 + 3; // 3723 seconds
      
      const result = ValidationUtils.getTimeInSeconds(timeArray);
      expect(result).toBe(expected);
    });
  });

  describe('isCopyComplete', () => {
    it('should return true for MSG:5036 success message', () => {
      const data = `MSG:5036,0,1,"Copy complete. 1 titles saved."
Other output lines here`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(true);
    });

    it('should return true for "Copy complete" message', () => {
      const data = `Some output
Copy complete
More output`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(true);
    });

    it('should return false for data without success message', () => {
      const data = `MSG:5037,0,1,"Copy failed"
Some other output
Error occurred`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(false);
    });

    it('should return false for empty data', () => {
      const result = ValidationUtils.isCopyComplete('');
      expect(result).toBe(false);
    });

    it('should handle partial matches correctly', () => {
      const data = `MSG:503,0,1,"Partial message"
Not copy complete
Something else`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(false);
    });

    it('should be case sensitive for "Copy complete"', () => {
      const data = `copy complete
COPY COMPLETE
Copy Complete`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(false);
    });

    it('should handle multiple success indicators', () => {
      const data = `MSG:5036,0,1,"Copy complete. 1 titles saved."
Copy complete
All done`;
      
      const result = ValidationUtils.isCopyComplete(data);
      expect(result).toBe(true);
    });

    it('should handle multiline data correctly', () => {
      const multilineData = [
        'Line 1',
        'Line 2',
        'MSG:5036,0,1,"Copy complete. Multiple titles saved."',
        'Line 4',
        'Line 5'
      ].join('\n');
      
      const result = ValidationUtils.isCopyComplete(multilineData);
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined input gracefully', () => {
      expect(() => ValidationUtils.getTimeInSeconds(undefined)).not.toThrow();
      expect(() => ValidationUtils.isCopyComplete(undefined)).not.toThrow();
    });

    it('should handle null input gracefully', () => {
      expect(() => ValidationUtils.getTimeInSeconds(null)).not.toThrow();
      expect(() => ValidationUtils.isCopyComplete(null)).not.toThrow();
    });

    it('should handle malformed time arrays', () => {
      const result = ValidationUtils.getTimeInSeconds(['not', 'a', 'number']);
      expect(result).toBeNaN();
    });

    it('should handle empty time array', () => {
      const result = ValidationUtils.getTimeInSeconds([]);
      expect(result).toBe(0);
    });
  });
});
