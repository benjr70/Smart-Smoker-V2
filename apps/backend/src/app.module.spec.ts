import { readFileSync } from 'fs';
import { join } from 'path';
import { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';

/**
 * The backend's module graph, read off the decorators.
 *
 * Nest cannot *construct* a loop of modules: two that import each other have
 * to be joined by a `forwardRef` thunk so the reference is read after both
 * files have finished evaluating. That thunk is therefore the honest marker of
 * a cycle in this graph, and the Active Cook exists so that the cycles around
 * the cook in progress do not. Walked here rather than booted because booting
 * the application opens a database connection, and the shape of the graph is a
 * fact about the decorators alone.
 */
type ModuleEntry =
  | Type<unknown>
  | DynamicModule
  | ForwardReference
  | Promise<unknown>;

/** Whether an entry is a `forwardRef` thunk — a declared cycle. */
const isForwardReference = (entry: ModuleEntry): boolean =>
  typeof entry === 'object' && entry !== null && 'forwardRef' in entry;

/** The module class an entry names, whether given plainly or as a dynamic one. */
const classOf = (entry: ModuleEntry): Type<unknown> | null => {
  if (typeof entry === 'function') {
    return entry as Type<unknown>;
  }
  if (typeof entry === 'object' && entry !== null && 'module' in entry) {
    return (entry as DynamicModule).module;
  }
  return null;
};

/** What a module (or a dynamic module) imports, as declared. */
const importsOf = (entry: ModuleEntry): ModuleEntry[] => {
  const declared =
    typeof entry === 'object' && entry !== null && 'imports' in entry
      ? ((entry as DynamicModule).imports as ModuleEntry[])
      : [];
  const target = classOf(entry);
  const decorated = target
    ? ((Reflect.getMetadata(MODULE_METADATA.IMPORTS, target) ??
        []) as ModuleEntry[])
    : [];
  return [...(declared ?? []), ...decorated];
};

/** Every import edge reachable from the root, each with the module it is in. */
const edges = (root: Type<unknown>): { from: string; to: ModuleEntry }[] => {
  const walked = new Set<unknown>();
  const found: { from: string; to: ModuleEntry }[] = [];
  const walk = (entry: ModuleEntry): void => {
    const target = classOf(entry);
    if (target) {
      if (walked.has(target)) {
        return;
      }
      walked.add(target);
    }
    importsOf(entry).forEach((imported) => {
      found.push({ from: target?.name ?? 'an anonymous module', to: imported });
      if (!isForwardReference(imported)) {
        walk(imported);
      }
    });
  };
  walk(root);
  return found;
};

describe('the backend module graph', () => {
  /**
   * ADR 0001: the Active Cook owns the cook in progress and depends only on
   * the models, which is what let the thunks that used to hold State, Smoke,
   * StaleCook, Timeline and the gateway together go. A reintroduced one is a
   * reintroduced cycle, and is worth failing on rather than reading about in a
   * boot log.
   */
  it('declares no circular dependency anywhere', () => {
    const cycles = edges(AppModule)
      .filter(({ to }) => isForwardReference(to))
      .map(({ from }) => from);

    expect(cycles).toEqual([]);
  });

  /**
   * The state singleton is the Active Cook's own storage, and the three routes
   * the apps ask the cook about are served there. A `StateModule` back in the
   * graph is a second owner of the cook, which is the shape this whole spec
   * exists to keep out.
   */
  it('holds no module of its own for the state', () => {
    const modules = edges(AppModule)
      .map(({ to }) => classOf(to)?.name)
      .filter(Boolean);

    expect(modules).toContain('ActiveCookModule');
    expect(modules).not.toContain('StateModule');
    expect(modules).not.toContain('CommonModule');
  });

  /**
   * `CLAUDE.md` is the doc of record an agent reads before touching this
   * backend, and it describes the module graph in prose. A name in there that
   * the graph no longer holds sends the next reader looking for a module that
   * does not exist, so the prose is checked against the walk rather than
   * trusted.
   */
  it('is described by CLAUDE.md with names the graph still holds', () => {
    const doc = readFileSync(
      join(__dirname, '..', '..', '..', 'CLAUDE.md'),
      'utf8',
    );
    const named = ['StateModule', 'State module', 'CommonModule'].filter(
      (name) => doc.includes(name),
    );

    expect(named).toEqual([]);
    expect(doc).toContain('activeCook');
  });
});
