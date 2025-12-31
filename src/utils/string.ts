/**
 * Returns the appropriate plural form of a word based on count
 * @param count Number to check
 * @param word Singular form of the word
 * @param plural Optional custom plural form (defaults to word + 's')
 */
export function pluralize(count: number, word: string, plural?: string): string {
  return count === 1 ? word : plural || word + 's';
}

/**
 * Format a timestamp to "time ago" format (e.g., "5 minutes ago", "2 hours ago")
 * Capped at hours (no days), uses largest time unit available
 * @param date Date or timestamp in milliseconds
 */
export function timeAgo(date: Date | number): string {
  const now = Date.now();
  const timestamp = typeof date === 'number' ? date : date.getTime();
  const diffMs = now - timestamp;

  // Calculate time units
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  // Return largest unit, capped at hours
  if (hours > 0) {
    return `${hours} ${pluralize(hours, 'hour')} ago`;
  } else if (minutes > 0) {
    return `${minutes} ${pluralize(minutes, 'minute')} ago`;
  } else {
    return `${Math.max(0, seconds)} ${pluralize(Math.max(0, seconds), 'second')} ago`;
  }
}

/**
 * Shorten text with ellipsis in the middle
 * @param str String to shorten
 * @param limit Maximum length before shortening
 */
export function shortenText(str: string = '', limit: number = 18): string {
  if (str.length > limit) {
    const partLength = Math.floor((limit - 3) / 2);
    return str.slice(0, partLength) + '...' + str.slice(str.length - partLength, str.length);
  }
  return str;
}

/**
 * Format a number as an ordinal (1st, 2nd, 3rd, etc.)
 * @param value Number to format
 */
export function numberToOrdinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = value % 100;
  return value + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Format a duration in milliseconds to [hh:]mm:ss
 * @param duration Duration in milliseconds
 */
export function formatDuration(duration: number): string {
  const totalSeconds = Math.floor(duration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => num.toString().padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

