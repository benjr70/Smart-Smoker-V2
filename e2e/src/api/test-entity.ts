/**
 * Test-entity naming + prefix filtering — the fixture's data-hygiene safety net.
 *
 * Every entity the e2e suite seeds is named with the `smoke-test-` prefix, and
 * the fixture may only ever delete records whose name carries that prefix. This
 * module owns the single source of truth for that prefix and the (deliberately
 * strict) predicate used to decide what is safe to delete. Keeping it pure and
 * dependency-free makes the safety guarantee unit-testable without a stack.
 */

/** Prefix stamped onto every entity the e2e suite creates. */
export const TEST_ENTITY_PREFIX = 'smoke-test-';

/**
 * Whether `name` identifies an e2e-created entity that is safe to delete.
 *
 * Strict on purpose: only a string that literally begins with the exact prefix
 * qualifies. Non-strings, empty strings, and lookalike prefixes never match, so
 * cleanup/sweep can never select real data.
 */
export function isTestEntityName(name: unknown): boolean {
  return typeof name === 'string' && name.startsWith(TEST_ENTITY_PREFIX);
}

/**
 * Build a unique, prefixed name for a freshly seeded entity. `label` is an
 * optional human hint (slugged into the name for readable test output); the
 * uniqueness comes from a timestamp + random suffix so concurrent runs cannot
 * collide on the same name.
 */
export function testEntityName(label = 'entity'): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'entity';
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${TEST_ENTITY_PREFIX}${slug}-${unique}`;
}

/**
 * Filter `entities` down to only those the e2e suite created, using each row's
 * name. Anything without a prefixed name is excluded — this is the choke point
 * that guarantees a sweep can never delete real data.
 */
export function selectTestEntities<T>(
  entities: readonly T[],
  getName: (entity: T) => unknown
): T[] {
  return entities.filter(entity => isTestEntityName(getName(entity)));
}
