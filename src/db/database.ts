export type ScheduleDatabase = {
  execAsync(source: string): Promise<void>;
  runSync(source: string, ...params: unknown[]): { changes?: number } | void;
  runAsync(source: string, ...params: unknown[]): Promise<{ changes?: number } | void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
};
