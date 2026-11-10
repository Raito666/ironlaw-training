import type { SetRecord, SetType } from './types';

export const setTypeLabels: Record<SetType, string> = { warmup: '热身', work: '正式', drop: '递减', failure: '力竭' };
/** All actual effort sets count; a warmup never becomes work volume. */
export const isWorkSet = (set: Pick<SetRecord, 'type'>): boolean => set.type !== 'warmup';

// A reserved item-ID prefix preserves warmup roles in the existing backup and share formats.
const warmupItemPrefix = 'warmup:';
export const warmupTemplateItemId = (id: string): string => warmupItemPrefix + id;
export const isWarmupTemplateItem = (item: { id: string }): boolean => item.id.startsWith(warmupItemPrefix);
