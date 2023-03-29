/**
 * Utility Types
 */
import { F } from 'ts-toolbelt';

export type MaybeAsync<T extends F.Function> = T | F.Promisify<T>; // Utility Type: make a function maybe async
