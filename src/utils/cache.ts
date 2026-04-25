/**
 * Generic LRU Cache
 *
 * 単純な Map ベースの LRU 実装（Map の挿入順序が保たれることを利用）。
 */

export class LRUCache<K, V> {
  private map: Map<K, V>;
  public readonly maxSize: number;
  public readonly name: string;

  constructor(maxSize: number, name = 'LRUCache') {
    if (maxSize <= 0) throw new Error('maxSize must be > 0');
    this.maxSize = maxSize;
    this.name = name;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // touch — move to most-recently-used
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // evict least-recently-used (= oldest in insertion order)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
