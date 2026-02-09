/**
 * Tests for StateManager
 */

import { StateManager, type ProjectState, type BridgeState } from '../../src/state/index.js';
import type { IStorage } from '../../src/types/interfaces.js';

// Mock storage implementation for testing
class MockStorage implements IStorage {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();

  readFile(path: string, _encoding: string): string {
    const content = this.files.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  writeFile(path: string, data: string): void {
    this.files.set(path, data);
  }

  chmod(_path: string, _mode: number): void {}

  exists(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  mkdirp(path: string): void {
    this.dirs.add(path);
  }

  unlink(path: string): void {
    this.files.delete(path);
  }

  openSync(_path: string, _flags: string): number {
    return 0;
  }

  // Test helper
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }
}

// Helper function to create test ProjectState objects
function makeProject(name: string, channelId?: string): ProjectState {
  return {
    projectName: name,
    projectPath: `/path/${name}`,
    tmuxSession: `agent-${name}`,
    discordChannels: channelId ? { claude: channelId } : {},
    agents: { claude: true },
    createdAt: new Date(),
    lastActive: new Date(),
  };
}

describe('StateManager', () => {
  const stateDir = '/test/dir';
  const stateFile = '/test/dir/state.json';

  describe('initialization', () => {
    it('creates with empty state when no file exists', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      expect(manager.listProjects()).toEqual([]);
      expect(manager.getGuildId()).toBeUndefined();
    });

    it('loads existing state from storage', () => {
      const storage = new MockStorage();
      const project = makeProject('test-project', 'channel-123');
      const state: BridgeState = {
        projects: { 'test-project': project },
        guildId: 'guild-456',
      };
      storage.setFile(stateFile, JSON.stringify(state));

      const manager = new StateManager(storage, stateDir, stateFile);

      expect(manager.listProjects()).toHaveLength(1);

      const loaded = manager.getProject('test-project');
      expect(loaded).toBeDefined();
      expect(loaded?.projectName).toBe('test-project');
      expect(loaded?.projectPath).toBe('/path/test-project');
      expect(loaded?.tmuxSession).toBe('agent-test-project');
      expect(loaded?.discordChannels.claude).toBe('channel-123');

      expect(manager.getGuildId()).toBe('guild-456');
    });

    it('handles corrupted JSON gracefully', () => {
      const storage = new MockStorage();
      storage.setFile(stateFile, 'invalid json {{{');

      const manager = new StateManager(storage, stateDir, stateFile);

      expect(manager.listProjects()).toEqual([]);
      expect(manager.getGuildId()).toBeUndefined();
    });
  });

  describe('project management', () => {
    it('setProject saves and persists to storage', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);
      const project = makeProject('my-project', 'channel-789');

      manager.setProject(project);

      expect(manager.getProject('my-project')).toEqual(project);

      // Verify it was persisted to storage
      const savedData = storage.readFile(stateFile, 'utf-8');
      const savedState = JSON.parse(savedData);
      expect(savedState.projects['my-project']).toBeDefined();
    });

    it('getProject returns existing project', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);
      const project = makeProject('existing-project');

      manager.setProject(project);

      const retrieved = manager.getProject('existing-project');
      expect(retrieved).toEqual(project);
    });

    it('getProject returns undefined for unknown project', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      const result = manager.getProject('non-existent');
      expect(result).toBeUndefined();
    });

    it('removeProject deletes project and saves', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);
      const project = makeProject('to-remove');

      manager.setProject(project);
      expect(manager.getProject('to-remove')).toBeDefined();

      manager.removeProject('to-remove');

      expect(manager.getProject('to-remove')).toBeUndefined();

      // Verify persistence
      const savedData = storage.readFile(stateFile, 'utf-8');
      const savedState = JSON.parse(savedData);
      expect(savedState.projects['to-remove']).toBeUndefined();
    });

    it('listProjects returns all projects', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      const project1 = makeProject('project-1');
      const project2 = makeProject('project-2');
      const project3 = makeProject('project-3');

      manager.setProject(project1);
      manager.setProject(project2);
      manager.setProject(project3);

      const projects = manager.listProjects();
      expect(projects).toHaveLength(3);
      expect(projects.map(p => p.projectName)).toContain('project-1');
      expect(projects.map(p => p.projectName)).toContain('project-2');
      expect(projects.map(p => p.projectName)).toContain('project-3');
    });
  });

  describe('guild management', () => {
    it('setGuildId saves guild ID', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      manager.setGuildId('new-guild-123');

      expect(manager.getGuildId()).toBe('new-guild-123');

      // Verify persistence
      const savedData = storage.readFile(stateFile, 'utf-8');
      const savedState = JSON.parse(savedData);
      expect(savedState.guildId).toBe('new-guild-123');
    });
  });

  describe('activity tracking', () => {
    it('updateLastActive updates timestamp', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);
      const project = makeProject('active-project');
      const originalTime = new Date('2024-01-01T00:00:00Z');
      project.lastActive = originalTime;

      manager.setProject(project);

      // Wait a tiny bit to ensure timestamp differs
      const beforeUpdate = Date.now();
      manager.updateLastActive('active-project');

      const updated = manager.getProject('active-project');
      expect(updated).toBeDefined();
      expect(new Date(updated!.lastActive).getTime()).toBeGreaterThanOrEqual(beforeUpdate);
    });
  });

  describe('channel lookups', () => {
    it('findProjectByChannel finds correct project', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      const project1 = makeProject('proj-1', 'channel-aaa');
      const project2 = makeProject('proj-2', 'channel-bbb');

      manager.setProject(project1);
      manager.setProject(project2);

      const found = manager.findProjectByChannel('channel-bbb');
      expect(found).toBeDefined();
      expect(found?.projectName).toBe('proj-2');
    });

    it('getAgentTypeByChannel returns correct agent type', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      const project = makeProject('test-project');
      project.discordChannels = {
        claude: 'channel-111',
        gemini: 'channel-222',
      };

      manager.setProject(project);

      expect(manager.getAgentTypeByChannel('channel-111')).toBe('claude');
      expect(manager.getAgentTypeByChannel('channel-222')).toBe('gemini');
      expect(manager.getAgentTypeByChannel('channel-999')).toBeUndefined();
    });
  });

  describe('state reloading', () => {
    it('reload re-reads state from storage', () => {
      const storage = new MockStorage();
      const manager = new StateManager(storage, stateDir, stateFile);

      const project = makeProject('original');
      manager.setProject(project);

      expect(manager.getProject('original')).toBeDefined();

      // Modify storage directly to simulate external change
      const newState: BridgeState = {
        projects: { 'external': makeProject('external') },
      };
      storage.setFile(stateFile, JSON.stringify(newState));

      manager.reload();

      expect(manager.getProject('original')).toBeUndefined();
      expect(manager.getProject('external')).toBeDefined();
    });
  });
});
