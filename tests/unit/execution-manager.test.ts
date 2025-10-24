import { describe, it, expect, beforeEach } from "@jest/globals";
import { ExecutionManager } from "../../src/execution-manager.js";

describe("ExecutionManager", () => {
  let execution: ExecutionManager;

  beforeEach(() => {
    execution = new ExecutionManager({
      image: "test-image",
      cpuLimit: "1.0",
      memoryLimit: "1g",
      timeoutMs: 30000,
      gracePeriodMs: 5000,
      openCodeServerEnabled: false,
    });
  });

  describe("Configuration", () => {
    it("should initialize with Docker mode", () => {
      expect(execution).toBeDefined();
    });

    it("should initialize with OpenCode server mode", () => {
      const serverExecution = new ExecutionManager({
        image: "test-image",
        cpuLimit: "1.0",
        memoryLimit: "1g",
        timeoutMs: 30000,
        gracePeriodMs: 5000,
        openCodeServerEnabled: true,
        openCodeServerUrl: "http://localhost:3100",
      });
      expect(serverExecution).toBeDefined();
    });
  });

  describe("Task Tracking", () => {
    it("should return empty active tasks list initially", () => {
      const tasks = execution.getActiveTasks();
      expect(tasks).toEqual([]);
    });

    it("should check if task is active", () => {
      const isActive = execution.isTaskActive("test-task");
      expect(isActive).toBe(false);
    });

    it("should return undefined for non-existent container info", () => {
      const info = execution.getContainerInfo("test-task");
      expect(info).toBeUndefined();
    });
  });

  describe("Cleanup", () => {
    it("should cleanup without errors", () => {
      expect(() => execution.cleanup()).not.toThrow();
    });
  });
});
