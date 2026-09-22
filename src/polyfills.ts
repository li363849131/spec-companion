// Global ECMAScript polyfills for modern PDF.js & Map Upsert methods

// 1. Promise.withResolvers
if (typeof Promise !== 'undefined' && !(Promise as any).withResolvers) {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// 2. Map.prototype.getOrInsertComputed & getOrInsert
if (typeof Map !== 'undefined') {
  const mapProto = Map.prototype as any;
  if (!mapProto.getOrInsertComputed) {
    mapProto.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, callbackFunction: (key: K) => V): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      const value = callbackFunction(key);
      this.set(key, value);
      return value;
    };
  }

  if (!mapProto.getOrInsert) {
    mapProto.getOrInsert = function <K, V>(this: Map<K, V>, key: K, defaultValue: V): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

// 3. WeakMap.prototype.getOrInsertComputed & getOrInsert
if (typeof WeakMap !== 'undefined') {
  const weakMapProto = WeakMap.prototype as any;
  if (!weakMapProto.getOrInsertComputed) {
    weakMapProto.getOrInsertComputed = function <K extends object, V>(this: WeakMap<K, V>, key: K, callbackFunction: (key: K) => V): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      const value = callbackFunction(key);
      this.set(key, value);
      return value;
    };
  }

  if (!weakMapProto.getOrInsert) {
    weakMapProto.getOrInsert = function <K extends object, V>(this: WeakMap<K, V>, key: K, defaultValue: V): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

export {};
