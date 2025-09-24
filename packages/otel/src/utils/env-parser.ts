/**
 * Retrieves a string from an environment variable.
 * - Returns `undefined` if the environment variable is empty, unset, or contains only whitespace.
 *
 * @param {string} key - The name of the environment variable to retrieve.
 * @returns {string | undefined} - The string value or `undefined`.
 */
export function getStringFromEnv(key: string): string | undefined {
    const raw = process.env[key];
    if (raw == null || raw.trim() === '') {
      return undefined;
    }
    return raw;
  }

/**
 * Retrieves a list of strings from an environment variable.
 * - Uses ',' as the delimiter.
 * - Trims leading and trailing whitespace from each entry.
 * - Excludes empty entries.
 * - Returns `undefined` if the environment variable is empty or contains only whitespace.
 * - Returns an empty array if all entries are empty or whitespace.
 *
 * @param {string} key - The name of the environment variable to retrieve.
 * @returns {string[] | undefined} - The list of strings or `undefined`.
 */
export function getStringListFromEnv(key: string): string[] | undefined {
  return getStringFromEnv(key)
    ?.split(',')
    .map(v => v.trim())
    .filter(s => s !== '');
}