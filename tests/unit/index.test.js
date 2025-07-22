/**
 * Unit tests for main index.js entry point
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all dependencies before importing
vi.mock('../../src/cli/interface.js', () => ({
  CLIInterface: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../src/config/index.js', () => ({
  AppConfig: {
    validate: vi.fn()
  }
}));

vi.mock('../../src/utils/logger.js', () => ({
  Logger: {
    error: vi.fn()
  }
}));

describe('Main Application (index.js)', () => {
  let processExitSpy;
  let consoleErrorSpy;
  let processOnSpy;
  let mockCLIInterface;
  let mockAppConfig;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Spy on process methods
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => {});

    // Get mocked modules
    const { CLIInterface } = await import('../../src/cli/interface.js');
    const { AppConfig } = await import('../../src/config/index.js');
    const { Logger } = await import('../../src/utils/logger.js');
    
    mockCLIInterface = CLIInterface;
    mockAppConfig = AppConfig;
    mockLogger = Logger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  describe('Application startup', () => {
    it('should validate configuration before starting CLI', async () => {
      // Mock successful validation and CLI start
      mockAppConfig.validate.mockImplementation(() => {});
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined)
      }));

      // Import and run the main function
      await import('../../index.js');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAppConfig.validate).toHaveBeenCalled();
      expect(mockCLIInterface).toHaveBeenCalled();
    });

    it('should create CLIInterface instance and call start', async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const mockStart = vi.fn().mockResolvedValue(undefined);
      mockCLIInterface.mockImplementation(() => ({
        start: mockStart
      }));

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCLIInterface).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('should handle configuration validation errors', async () => {
      const configError = new Error('Configuration validation failed');
      mockAppConfig.validate.mockImplementation(() => {
        throw configError;
      });

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        configError.message
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle CLI start errors', async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const cliError = new Error('CLI failed to start');
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockRejectedValue(cliError)
      }));

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        cliError.message
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Error handling setup', () => {
    it('should set up unhandled rejection handler', async () => {
      await import('../../index.js');

      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should set up uncaught exception handler', async () => {
      await import('../../index.js');

      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should handle unhandled promise rejections', async () => {
      let unhandledRejectionHandler;
      
      processOnSpy.mockImplementation((event, handler) => {
        if (event === 'unhandledRejection') {
          unhandledRejectionHandler = handler;
        }
      });

      await import('../../index.js');

      expect(unhandledRejectionHandler).toBeDefined();

      // Test the handler
      const testReason = 'Promise rejection reason';
      const testPromise = Promise.reject(testReason);
      
      unhandledRejectionHandler(testReason, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled Rejection at:', testPromise);
      expect(mockLogger.error).toHaveBeenCalledWith('Reason:', testReason);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle uncaught exceptions', async () => {
      let uncaughtExceptionHandler;
      
      processOnSpy.mockImplementation((event, handler) => {
        if (event === 'uncaughtException') {
          uncaughtExceptionHandler = handler;
        }
      });

      await import('../../index.js');

      expect(uncaughtExceptionHandler).toBeDefined();

      // Test the handler
      const testError = new Error('Uncaught exception');
      
      uncaughtExceptionHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught Exception:', testError.message);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete successful startup flow', async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const mockStart = vi.fn().mockResolvedValue(undefined);
      mockCLIInterface.mockImplementation(() => ({
        start: mockStart
      }));

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAppConfig.validate).toHaveBeenCalled();
      expect(mockCLIInterface).toHaveBeenCalled();
      expect(mockStart).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should setup all error handlers before starting application', async () => {
      const eventHandlers = {};
      processOnSpy.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      });

      mockAppConfig.validate.mockImplementation(() => {});
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined)
      }));

      await import('../../index.js');

      expect(eventHandlers.unhandledRejection).toBeDefined();
      expect(eventHandlers.uncaughtException).toBeDefined();
      expect(mockAppConfig.validate).toHaveBeenCalled();
    });

    it('should handle errors during error handler setup', async () => {
      // Mock process.on to throw an error
      processOnSpy.mockImplementation(() => {
        throw new Error('Failed to setup error handlers');
      });

      // This should not prevent the application from trying to start
      await expect(import('../../index.js')).resolves.toBeDefined();
    });
  });

  describe('Module structure', () => {
    it('should have correct shebang for executable', async () => {
      // Read the actual file to check shebang
      const fs = await import('fs');
      const content = fs.readFileSync('./index.js', 'utf8');
      
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    it('should have proper JSDoc comments', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('./index.js', 'utf8');
      
      expect(content).toContain('/**');
      expect(content).toContain('MakeMKV Auto Rip');
      expect(content).toContain('Main entry point');
    });

    it('should import required modules', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('./index.js', 'utf8');
      
      expect(content).toContain('import { CLIInterface }');
      expect(content).toContain('import { AppConfig }');
      expect(content).toContain('import { Logger }');
    });
  });

  describe('Error message formatting', () => {
    it('should format configuration errors properly', async () => {
      const configError = new Error('Missing required paths in configuration');
      mockAppConfig.validate.mockImplementation(() => {
        throw configError;
      });

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        'Missing required paths in configuration'
      );
    });

    it('should format CLI errors properly', async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      const cliError = new Error('CLI initialization failed');
      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockRejectedValue(cliError)
      }));

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        'CLI initialization failed'
      );
    });

    it('should handle errors without message property', async () => {
      const errorWithoutMessage = { toString: () => 'Custom error string' };
      mockAppConfig.validate.mockImplementation(() => {
        throw errorWithoutMessage;
      });

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        undefined
      );
    });
  });

  describe('Async behavior', () => {
    it('should handle async main function properly', async () => {
      let resolveValidation;
      const validationPromise = new Promise(resolve => {
        resolveValidation = resolve;
      });

      mockAppConfig.validate.mockImplementation(() => {
        return validationPromise;
      });

      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined)
      }));

      const importPromise = import('../../index.js');
      
      // Main should be waiting for validation
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockCLIInterface).not.toHaveBeenCalled();

      // Complete validation
      resolveValidation();
      await validationPromise;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCLIInterface).toHaveBeenCalled();
    });

    it('should handle CLI start promise rejection', async () => {
      mockAppConfig.validate.mockImplementation(() => {});
      
      let rejectCLI;
      const cliPromise = new Promise((resolve, reject) => {
        rejectCLI = reject;
      });

      mockCLIInterface.mockImplementation(() => ({
        start: vi.fn().mockReturnValue(cliPromise)
      }));

      await import('../../index.js');
      await new Promise(resolve => setTimeout(resolve, 10));

      // Reject the CLI promise
      const cliError = new Error('Async CLI error');
      rejectCLI(cliError);
      
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        'Async CLI error'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
