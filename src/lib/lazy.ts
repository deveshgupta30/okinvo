type AnyFunction = (...args: unknown[]) => unknown;

/**
 * A proxy that creates its target on first use. Used for `env` and `prisma`, which must not run
 * their constructors at import time (`next build` evaluates route modules without a database or
 * a production environment). Methods are bound to the real target and cached, so `proxy.fn`
 * has a stable identity; `in`, `Object.keys` and `instanceof` see the real object.
 */
export function lazyProxy<T extends object>(create: () => T): T {
  let target: T | undefined;
  const boundMethods = new Map<PropertyKey, AnyFunction>();
  const resolve = (): T => (target ??= create());

  return new Proxy({} as T, {
    get(_, key) {
      const real = resolve();
      const value: unknown = Reflect.get(real, key, real);
      if (typeof value !== "function") return value;
      let bound = boundMethods.get(key);
      if (!bound) {
        bound = (value as AnyFunction).bind(real) as AnyFunction;
        boundMethods.set(key, bound);
      }
      return bound;
    },
    set: (_, key, value) => Reflect.set(resolve(), key, value),
    has: (_, key) => Reflect.has(resolve(), key),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), key);
      // The proxy's own target is `{}`, so every reported descriptor must be configurable.
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(resolve()),
  });
}
