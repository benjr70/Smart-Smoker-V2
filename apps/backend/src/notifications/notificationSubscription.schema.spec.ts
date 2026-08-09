import { NotificationSubscriptionSchema } from './notificationSubscription.schema';

describe('NotificationSubscriptionSchema', () => {
  /**
   * `expirationTime` is `number | null`, and `@Prop()` infers its SchemaType
   * from the metadata TypeScript emits for that annotation. Under
   * `strictNullChecks` the union is real, so the emitted type is `Object` and
   * Mongoose refuses to build the schema at all — the storage type has to be
   * stated. Pinned to `Number`, which is what the field already compiled to
   * before the flag was turned on, so no stored document changes shape.
   */
  it('stores expirationTime as a Number', () => {
    expect(NotificationSubscriptionSchema.path('expirationTime')).toBeDefined();
    expect(NotificationSubscriptionSchema.path('expirationTime').instance).toBe(
      'Number',
    );
  });
});
