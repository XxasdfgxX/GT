/** Typed pub/sub between features. Unsubscribe drops the listener. */

type Handler<T> = (payload: T) => void;

export class EventBus<T extends { [K in keyof T]: unknown }> {
  private readonly listeners = new Map<keyof T, Set<Handler<T[keyof T]>>>();

  on<K extends keyof T>(event: K, handler: Handler<T[K]>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const wrapped = handler as Handler<T[keyof T]>;
    bucket.add(wrapped);
    return () => {
      bucket.delete(wrapped);
    };
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const handler of bucket) handler(payload);
  }
}
