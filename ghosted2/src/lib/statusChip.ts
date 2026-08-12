import type { SessionStatus } from '../../shared/protocol';

export type ChipTone = 'accent-pulse' | 'warn' | 'error' | 'muted';

/**
 * Maps session status to a chip visual tone.
 * running -> accent pulse, awaiting-permission -> amber,
 * error/exited -> red, idle/done/starting -> muted.
 */
export function chipToneForStatus(status: SessionStatus): ChipTone {
  switch (status) {
    case 'running':
      return 'accent-pulse';
    case 'awaiting-permission':
      return 'warn';
    case 'error':
    case 'exited':
      return 'error';
    case 'idle':
    case 'done':
    case 'starting':
    default:
      return 'muted';
  }
}
