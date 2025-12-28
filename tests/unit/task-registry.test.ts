import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";
import { TaskRegistry } from "../../src/task-registry.js";

describe("TaskRegistry", () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new TaskRegistry({
      maxConcurrentTasks: 3,
      idempotencyWindowMs: 60000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("register", () => {
    it("should register a new task", () => {
      const entry = registry.register("task-1", "agent-1");

      expect(entry.taskId).toBe("task-1");
      expect(entry.agentId).toBe("agent-1");
      expect(entry.status).toBe("queued");
      expect(entry.createdAt).toBeGreaterThan(0);
    });

    it("should register task with idempotency key", () => {
      const entry = registry.register("task-1", "agent-1", "idem-key-1");

      expect(entry.idempotencyKey).toBe("idem-key-1");
    });

    it("should return existing task for duplicate idempotency key", () => {
      const entry1 = registry.register("task-1", "agent-1", "idem-key-1");
      const entry2 = registry.register("task-2", "agent-1", "idem-key-1");

      expect(entry2).toBe(entry1);
      expect(entry2.taskId).toBe("task-1");
    });
  });

  describe("updateStatus", () => {
    it("should update task status", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "running");

      const task = registry.getTask("task-1");
      expect(task?.status).toBe("running");
      expect(task?.startedAt).toBeDefined();
    });

    it("should set startedAt when status becomes running", () => {
      registry.register("task-1", "agent-1");
      const beforeStart = Date.now();
      
      registry.updateStatus("task-1", "running");
      
      const task = registry.getTask("task-1");
      expect(task?.startedAt).toBeGreaterThanOrEqual(beforeStart);
    });

    it("should set completedAt when status becomes completed", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "running");
      
      const beforeComplete = Date.now();
      registry.updateStatus("task-1", "completed");
      
      const task = registry.getTask("task-1");
      expect(task?.completedAt).toBeGreaterThanOrEqual(beforeComplete);
      expect(task?.status).toBe("completed");
    });

    it("should set completedAt when status becomes failed", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "failed");

      const task = registry.getTask("task-1");
      expect(task?.completedAt).toBeDefined();
      expect(task?.status).toBe("failed");
    });

    it("should set completedAt when status becomes timeout", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "timeout");

      const task = registry.getTask("task-1");
      expect(task?.completedAt).toBeDefined();
      expect(task?.status).toBe("timeout");
    });

    it("should update workspace block ID", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "running", {
        workspaceBlockId: "block-123",
      });

      const task = registry.getTask("task-1");
      expect(task?.workspaceBlockId).toBe("block-123");
    });

    it("should handle updates to non-existent tasks gracefully", () => {
      expect(() => {
        registry.updateStatus("nonexistent", "running");
      }).not.toThrow();
    });
  });

  describe("getTask", () => {
    it("should retrieve registered task", () => {
      registry.register("task-1", "agent-1");

      const task = registry.getTask("task-1");
      expect(task?.taskId).toBe("task-1");
    });

    it("should return undefined for non-existent task", () => {
      const task = registry.getTask("nonexistent");
      expect(task).toBeUndefined();
    });
  });

  describe("getRunningTasksCount", () => {
    it("should count running tasks", () => {
      registry.register("task-1", "agent-1");
      registry.register("task-2", "agent-1");
      registry.register("task-3", "agent-1");

      registry.updateStatus("task-1", "running");
      registry.updateStatus("task-2", "running");

      expect(registry.getRunningTasksCount()).toBe(2);
    });

    it("should return 0 when no running tasks", () => {
      registry.register("task-1", "agent-1");
      expect(registry.getRunningTasksCount()).toBe(0);
    });
  });

  describe("canAcceptTask", () => {
    it("should return true when below max concurrent tasks", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "running");

      expect(registry.canAcceptTask()).toBe(true);
    });

    it("should return false when at max concurrent tasks", () => {
      registry.register("task-1", "agent-1");
      registry.register("task-2", "agent-1");
      registry.register("task-3", "agent-1");

      registry.updateStatus("task-1", "running");
      registry.updateStatus("task-2", "running");
      registry.updateStatus("task-3", "running");

      expect(registry.canAcceptTask()).toBe(false);
    });

    it("should return true when tasks complete", () => {
      registry.register("task-1", "agent-1");
      registry.register("task-2", "agent-1");
      registry.register("task-3", "agent-1");

      registry.updateStatus("task-1", "running");
      registry.updateStatus("task-2", "running");
      registry.updateStatus("task-3", "running");
      registry.updateStatus("task-1", "completed");

      expect(registry.canAcceptTask()).toBe(true);
    });
  });

  describe("getAllTasks", () => {
    it("should return all registered tasks", () => {
      registry.register("task-1", "agent-1");
      registry.register("task-2", "agent-1");
      registry.register("task-3", "agent-2");

      const tasks = registry.getAllTasks();
      expect(tasks).toHaveLength(3);
    });

    it("should return empty array when no tasks", () => {
      const tasks = registry.getAllTasks();
      expect(tasks).toHaveLength(0);
    });
  });

  describe("findTasksByAgent", () => {
    it("should find tasks by agent ID", () => {
      registry.register("task-1", "agent-1");
      registry.register("task-2", "agent-1");
      registry.register("task-3", "agent-2");

      const tasks = registry.findTasksByAgent("agent-1");
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.agentId === "agent-1")).toBe(true);
    });

    it("should return empty array for unknown agent", () => {
      registry.register("task-1", "agent-1");

      const tasks = registry.findTasksByAgent("unknown-agent");
      expect(tasks).toHaveLength(0);
    });
  });

  describe("Matrix room management", () => {
    it("should update Matrix room info", () => {
      registry.register("task-1", "agent-1");
      registry.updateMatrixRoom("task-1", {
        roomId: "!room:matrix.org",
        taskId: "task-1",
        participants: [],
        createdAt: Date.now(),
      });

      const task = registry.getTask("task-1");
      expect(task?.matrixRoom?.roomId).toBe("!room:matrix.org");
    });

    it("should find task by Matrix room ID", () => {
      registry.register("task-1", "agent-1");
      registry.updateMatrixRoom("task-1", {
        roomId: "!room:matrix.org",
        taskId: "task-1",
        participants: [],
        createdAt: Date.now(),
      });

      const task = registry.findTaskByMatrixRoom("!room:matrix.org");
      expect(task?.taskId).toBe("task-1");
    });

    it("should clear Matrix room info", () => {
      registry.register("task-1", "agent-1");
      registry.updateMatrixRoom("task-1", {
        roomId: "!room:matrix.org",
        taskId: "task-1",
        participants: [],
        createdAt: Date.now(),
      });
      registry.clearMatrixRoom("task-1");

      const task = registry.getTask("task-1");
      expect(task?.matrixRoom).toBeUndefined();
    });

    it("should return undefined when room not found", () => {
      registry.register("task-1", "agent-1");

      const task = registry.findTaskByMatrixRoom("!unknown:matrix.org");
      expect(task).toBeUndefined();
    });
  });

  describe("Cleanup", () => {
    it("should cleanup expired completed tasks", () => {
      // Register and complete a task
      registry.register("task-1", "agent-1", "idem-1");
      registry.updateStatus("task-1", "completed");

      // Get the task to verify it exists
      expect(registry.getTask("task-1")).toBeDefined();

      // Fast forward past the idempotency window (60 seconds) plus cleanup interval (1 hour)
      jest.advanceTimersByTime(3600000 + 60001);

      // After cleanup, task should be removed
      expect(registry.getTask("task-1")).toBeUndefined();
    });

    it("should not cleanup running tasks", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "running");

      // Fast forward past the cleanup interval
      jest.advanceTimersByTime(3600000 + 60001);

      // Running task should still exist
      expect(registry.getTask("task-1")).toBeDefined();
    });

    it("should cleanup idempotency keys along with tasks", () => {
      registry.register("task-1", "agent-1", "idem-key-1");
      registry.updateStatus("task-1", "completed");

      // Fast forward to trigger cleanup
      jest.advanceTimersByTime(3600000 + 60001);

      // Register new task with same idempotency key - should create new task
      const newTask = registry.register("task-2", "agent-1", "idem-key-1");
      expect(newTask.taskId).toBe("task-2");
    });

    it("should not cleanup tasks within idempotency window", () => {
      // Use a registry with a longer idempotency window
      const longWindowRegistry = new TaskRegistry({
        maxConcurrentTasks: 3,
        idempotencyWindowMs: 7200000, // 2 hours
      });
      
      longWindowRegistry.register("task-1", "agent-1");
      longWindowRegistry.updateStatus("task-1", "completed");

      // Fast forward cleanup interval (1 hour) - task completed recently, within 2hr window
      jest.advanceTimersByTime(3600000);

      // Task should still exist (within idempotency window of 2 hours)
      expect(longWindowRegistry.getTask("task-1")).toBeDefined();
    });

    it("should cleanup failed tasks after expiry", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "failed");

      // Fast forward past expiry
      jest.advanceTimersByTime(3600000 + 60001);

      expect(registry.getTask("task-1")).toBeUndefined();
    });

    it("should cleanup timeout tasks after expiry", () => {
      registry.register("task-1", "agent-1");
      registry.updateStatus("task-1", "timeout");

      // Fast forward past expiry
      jest.advanceTimersByTime(3600000 + 60001);

      expect(registry.getTask("task-1")).toBeUndefined();
    });
  });
});
