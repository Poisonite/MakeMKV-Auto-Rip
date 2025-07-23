/**
 * Unit tests for constants module
 */

import { describe, it, expect } from 'vitest';
import { 
  APP_INFO, 
  MEDIA_TYPES, 
  LOG_LEVELS, 
  VALIDATION_CONSTANTS, 
  MENU_OPTIONS 
} from '../../src/constants/index.js';

describe('Constants Module', () => {
  describe('APP_INFO', () => {
    it('should contain correct application information', () => {
      expect(APP_INFO).toBeDefined();
      expect(APP_INFO.name).toBe('MakeMKV Auto Rip');
      expect(APP_INFO.author).toBe('Zac Ingoglia (Poisonite)');
      expect(APP_INFO.copyright).toContain('Zac Ingoglia');
    });

    it('should have all required properties', () => {
      const requiredProps = ['name', 'version', 'author', 'copyright'];
      requiredProps.forEach(prop => {
        expect(APP_INFO).toHaveProperty(prop);
        expect(APP_INFO[prop]).toBeTruthy();
      });
    });
  });

  describe('MEDIA_TYPES', () => {
    it('should define correct media types', () => {
      expect(MEDIA_TYPES).toBeDefined();
      expect(MEDIA_TYPES.DVD).toBe('dvd');
      expect(MEDIA_TYPES.BLU_RAY).toBe('blu-ray');
    });

    it('should contain exactly two media types', () => {
      const mediaTypeKeys = Object.keys(MEDIA_TYPES);
      expect(mediaTypeKeys).toHaveLength(2);
      expect(mediaTypeKeys).toContain('DVD');
      expect(mediaTypeKeys).toContain('BLU_RAY');
    });

    it('should have lowercase values', () => {
      Object.values(MEDIA_TYPES).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });
    });
  });

  describe('LOG_LEVELS', () => {
    it('should define correct log levels', () => {
      expect(LOG_LEVELS).toBeDefined();
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.ERROR).toBe('error');
      expect(LOG_LEVELS.WARNING).toBe('warning');
    });

    it('should contain exactly three log levels', () => {
      const logLevelKeys = Object.keys(LOG_LEVELS);
      expect(logLevelKeys).toHaveLength(3);
      expect(logLevelKeys).toContain('INFO');
      expect(logLevelKeys).toContain('ERROR');
      expect(logLevelKeys).toContain('WARNING');
    });

    it('should have lowercase values', () => {
      Object.values(LOG_LEVELS).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });
    });
  });

  describe('VALIDATION_CONSTANTS', () => {
    it('should define correct validation constants', () => {
      expect(VALIDATION_CONSTANTS).toBeDefined();
      expect(VALIDATION_CONSTANTS.DRIVE_FILTER).toBe('DRV:');
      expect(VALIDATION_CONSTANTS.MEDIA_PRESENT).toBe(2);
      expect(VALIDATION_CONSTANTS.TITLE_LENGTH_CODE).toBe(9);
      expect(VALIDATION_CONSTANTS.COPY_COMPLETE_MSG).toBe('MSG:5036');
    });

    it('should have all required validation properties', () => {
      const requiredProps = ['DRIVE_FILTER', 'MEDIA_PRESENT', 'TITLE_LENGTH_CODE', 'COPY_COMPLETE_MSG'];
      requiredProps.forEach(prop => {
        expect(VALIDATION_CONSTANTS).toHaveProperty(prop);
        expect(VALIDATION_CONSTANTS[prop]).toBeDefined();
      });
    });

    it('should have correct data types', () => {
      expect(typeof VALIDATION_CONSTANTS.DRIVE_FILTER).toBe('string');
      expect(typeof VALIDATION_CONSTANTS.MEDIA_PRESENT).toBe('number');
      expect(typeof VALIDATION_CONSTANTS.TITLE_LENGTH_CODE).toBe('number');
      expect(typeof VALIDATION_CONSTANTS.COPY_COMPLETE_MSG).toBe('string');
    });
  });

  describe('MENU_OPTIONS', () => {
    it('should define correct menu options', () => {
      expect(MENU_OPTIONS).toBeDefined();
      expect(MENU_OPTIONS.RIP).toBe('1');
      expect(MENU_OPTIONS.EXIT).toBe('2');
    });

    it('should contain exactly two menu options', () => {
      const menuOptionKeys = Object.keys(MENU_OPTIONS);
      expect(menuOptionKeys).toHaveLength(2);
      expect(menuOptionKeys).toContain('RIP');
      expect(menuOptionKeys).toContain('EXIT');
    });

    it('should have string values', () => {
      Object.values(MENU_OPTIONS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('Constants Immutability', () => {
    it('should not allow modification of constants', () => {
      // Test that constants are read-only
      expect(() => {
        APP_INFO.name = 'Modified Name';
      }).toThrow();
    });

    it('should maintain referential equality', () => {
      const appInfo1 = APP_INFO;
      const appInfo2 = APP_INFO;
      expect(appInfo1).toBe(appInfo2);
    });
  });
});
