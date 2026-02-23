/**
 * Date formatting and grouping utilities for events
 */

/**
 * Groups a date into human-readable sections: "Today", "Tomorrow", or formatted date
 */
export function getDateGroupKey(date: Date): string {
  const now = new Date();
  const eventDate = new Date(date);

  // Reset time parts for accurate day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const event = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  if (event.getTime() === today.getTime()) {
    return 'Today';
  } else if (event.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  } else {
    // Format as "Sun, Jan 5" for future dates
    return eventDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Formats time for event display (e.g., "7:30 PM")
 */
export function formatEventTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats date for event card header
 */
export function formatEventDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Checks if an event is happening today
 */
export function isToday(date: Date): boolean {
  const now = new Date();
  const eventDate = new Date(date);
  return (
    eventDate.getDate() === now.getDate() &&
    eventDate.getMonth() === now.getMonth() &&
    eventDate.getFullYear() === now.getFullYear()
  );
}

/**
 * Checks if an event is live (in_progress or halftime)
 * Note: Uses uppercase comparison to match Prisma enum values
 */
export function isLive(status: string): boolean {
  const upperStatus = status.toUpperCase();
  return upperStatus === 'LIVE' || upperStatus === 'IN_PROGRESS' || upperStatus === 'HALFTIME';
}

/**
 * Formats an ISO date string as a compact relative time label.
 * Examples: "just now", "5m", "2h", "Yesterday", "Mon", "Jan 5"
 *
 * Used by notification inbox rows to show when a notification arrived.
 */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'just now';

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return new Date(isoString).toLocaleDateString('en-US', { weekday: 'short' });
  }

  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Gets a relative time description (e.g., "Starts in 2h", "Live", "Final")
 * Note: Uses uppercase comparison to match Prisma enum values
 */
export function getEventTimeLabel(scheduledAt: Date, status: string): string {
  const upperStatus = status.toUpperCase();
  if (upperStatus === 'LIVE' || upperStatus === 'IN_PROGRESS') return 'LIVE';
  if (upperStatus === 'HALFTIME') return 'HALFTIME';
  if (upperStatus === 'FINAL' || upperStatus === 'COMPLETED') return 'FINAL';
  if (upperStatus === 'POSTPONED') return 'POSTPONED';
  if (upperStatus === 'CANCELLED' || upperStatus === 'CANCELED') return 'CANCELLED';

  const now = new Date();
  const eventDate = new Date(scheduledAt);
  const diffMs = eventDate.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMs < 0) return 'Started';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;

  return formatEventTime(eventDate);
}
