/**
 * Unit tests for drive service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import winEject from 'win-eject';
import { DriveService } from '../../src/services/drive.service.js';

// Mock win-eject module
vi.mock('win-eject');

describe('DriveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadAllDrives', () => {
    it('should call winEject.close and resolve when successful', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      await expect(DriveService.loadAllDrives()).resolves.toBeUndefined();
      
      expect(winEject.close).toHaveBeenCalledWith('', expect.any(Function));
      expect(winEject.close).toHaveBeenCalledTimes(1);
    });

    it('should resolve even if winEject.close takes time', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        setTimeout(callback, 100);
      });

      const start = Date.now();
      await DriveService.loadAllDrives();
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(95); // Account for some variance
      expect(winEject.close).toHaveBeenCalledTimes(1);
    });

    it('should handle callback being called multiple times', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
        callback(); // Duplicate call
      });

      await expect(DriveService.loadAllDrives()).resolves.toBeUndefined();
      expect(winEject.close).toHaveBeenCalledTimes(1);
    });

    it('should resolve with undefined', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      const result = await DriveService.loadAllDrives();
      expect(result).toBeUndefined();
    });
  });

  describe('ejectAllDrives', () => {
    it('should call winEject.eject and resolve when successful', async () => {
      winEject.eject.mockImplementation((drive, callback) => {
        callback();
      });

      await expect(DriveService.ejectAllDrives()).resolves.toBeUndefined();
      
      expect(winEject.eject).toHaveBeenCalledWith('', expect.any(Function));
      expect(winEject.eject).toHaveBeenCalledTimes(1);
    });

    it('should resolve even if winEject.eject takes time', async () => {
      winEject.eject.mockImplementation((drive, callback) => {
        setTimeout(callback, 150);
      });

      const start = Date.now();
      await DriveService.ejectAllDrives();
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(145);
      expect(winEject.eject).toHaveBeenCalledTimes(1);
    });

    it('should resolve with undefined', async () => {
      winEject.eject.mockImplementation((drive, callback) => {
        callback();
      });

      const result = await DriveService.ejectAllDrives();
      expect(result).toBeUndefined();
    });

    it('should handle immediate callback execution', async () => {
      winEject.eject.mockImplementation((drive, callback) => {
        callback();
      });

      const start = Date.now();
      await DriveService.ejectAllDrives();
      const end = Date.now();

      expect(end - start).toBeLessThan(50); // Should be very fast
    });
  });

  describe('wait', () => {
    it('should wait for specified milliseconds', async () => {
      const waitTime = 100;
      const start = Date.now();
      
      await DriveService.wait(waitTime);
      
      const end = Date.now();
      const elapsed = end - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(waitTime - 10); // Allow some variance
      expect(elapsed).toBeLessThan(waitTime + 50); // Reasonable upper bound
    });

    it('should wait for zero milliseconds', async () => {
      const start = Date.now();
      
      await DriveService.wait(0);
      
      const end = Date.now();
      expect(end - start).toBeLessThan(20);
    });

    it('should wait for longer periods', async () => {
      const waitTime = 200;
      const start = Date.now();
      
      await DriveService.wait(waitTime);
      
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(waitTime - 10);
    });

    it('should resolve with undefined', async () => {
      const result = await DriveService.wait(50);
      expect(result).toBeUndefined();
    });

    it('should handle negative wait times', async () => {
      const start = Date.now();
      
      await DriveService.wait(-100);
      
      const end = Date.now();
      expect(end - start).toBeLessThan(20); // Should resolve immediately
    });
  });

  describe('loadDrivesWithWait', () => {
    beforeEach(() => {
      // Mock the Logger to avoid actual console output during tests
      vi.doMock('../../src/utils/logger.js', () => ({
        Logger: {
          separator: vi.fn(),
          warning: vi.fn(),
          info: vi.fn()
        }
      }));
    });

    it('should complete the full loading sequence', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      const start = Date.now();
      
      await DriveService.loadDrivesWithWait();
      
      const end = Date.now();
      
      expect(winEject.close).toHaveBeenCalledTimes(1);
      expect(end - start).toBeGreaterThanOrEqual(5000 - 100); // 5 second wait minus variance
      expect(end - start).toBeLessThan(5200); // Reasonable upper bound
    });

    it('should call loadAllDrives and then wait', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      const loadAllDrivesSpy = vi.spyOn(DriveService, 'loadAllDrives');
      const waitSpy = vi.spyOn(DriveService, 'wait');

      await DriveService.loadDrivesWithWait();

      expect(loadAllDrivesSpy).toHaveBeenCalledBefore(waitSpy);
      expect(waitSpy).toHaveBeenCalledWith(5000);
    });

    it('should handle loadAllDrives failure gracefully', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        // Simulate failure by not calling callback
        throw new Error('Drive loading failed');
      });

      await expect(DriveService.loadDrivesWithWait()).rejects.toThrow('Drive loading failed');
    });

    it('should wait exactly 5 seconds', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      const waitSpy = vi.spyOn(DriveService, 'wait');

      await DriveService.loadDrivesWithWait();

      expect(waitSpy).toHaveBeenCalledWith(5000);
    });
  });

  describe('Static Class Behavior', () => {
    it('should not allow instantiation', () => {
      expect(() => new DriveService()).toThrow();
    });

    it('should have all methods as static', () => {
      expect(typeof DriveService.loadAllDrives).toBe('function');
      expect(typeof DriveService.ejectAllDrives).toBe('function');
      expect(typeof DriveService.loadDrivesWithWait).toBe('function');
      expect(typeof DriveService.wait).toBe('function');
      expect(DriveService.prototype).toBeUndefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle sequential drive operations', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        setTimeout(callback, 50);
      });
      
      winEject.eject.mockImplementation((drive, callback) => {
        setTimeout(callback, 50);
      });

      const start = Date.now();

      await DriveService.loadAllDrives();
      await DriveService.ejectAllDrives();

      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(95); // At least 100ms total
      expect(winEject.close).toHaveBeenCalledTimes(1);
      expect(winEject.eject).toHaveBeenCalledTimes(1);
    });

    it('should handle parallel drive operations', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        setTimeout(callback, 100);
      });
      
      winEject.eject.mockImplementation((drive, callback) => {
        setTimeout(callback, 100);
      });

      const start = Date.now();

      // Run operations in parallel
      await Promise.all([
        DriveService.loadAllDrives(),
        DriveService.ejectAllDrives()
      ]);

      const end = Date.now();

      // Should complete in roughly 100ms, not 200ms
      expect(end - start).toBeLessThan(150);
      expect(winEject.close).toHaveBeenCalledTimes(1);
      expect(winEject.eject).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid successive calls', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback();
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(DriveService.loadAllDrives());
      }

      await Promise.all(promises);

      expect(winEject.close).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle winEject.close errors', () => {
      winEject.close.mockImplementation((drive, callback) => {
        throw new Error('Close operation failed');
      });

      expect(() => DriveService.loadAllDrives()).toThrow('Close operation failed');
    });

    it('should handle winEject.eject errors', () => {
      winEject.eject.mockImplementation((drive, callback) => {
        throw new Error('Eject operation failed');
      });

      expect(() => DriveService.ejectAllDrives()).toThrow('Eject operation failed');
    });

    it('should handle callback never being called', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        // Never call callback - this would hang in real scenario
      });

      // Create a race condition with timeout to test hanging behavior
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 100)
      );

      await expect(Promise.race([
        DriveService.loadAllDrives(),
        timeout
      ])).rejects.toThrow('Timeout');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined callback parameters', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        callback(undefined);
      });

      await expect(DriveService.loadAllDrives()).resolves.toBeUndefined();
    });

    it('should handle callback with extra parameters', async () => {
      winEject.eject.mockImplementation((drive, callback) => {
        callback('extra', 'parameters', 'ignored');
      });

      await expect(DriveService.ejectAllDrives()).resolves.toBeUndefined();
    });

    it('should handle empty string drive parameter correctly', async () => {
      winEject.close.mockImplementation((drive, callback) => {
        expect(drive).toBe('');
        callback();
      });

      await DriveService.loadAllDrives();
      
      expect(winEject.close).toHaveBeenCalledWith('', expect.any(Function));
    });

    it('should handle very small wait times', async () => {
      const result = await DriveService.wait(1);
      expect(result).toBeUndefined();
    });

    it('should handle very large wait times', async () => {
      // Test with a larger time but still reasonable for testing
      const start = Date.now();
      await DriveService.wait(500);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(490);
    }, 1000); // Increase test timeout for this specific test
  });
});
