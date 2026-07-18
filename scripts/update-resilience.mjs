/**
 * Run one upstream load without allowing its failure to reject a batch of
 * otherwise independent source refreshes.
 */
export async function loadSourceOrFallback({ key, load, warnings, fallbackValue = null }) {
  try {
    return await load();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warnings.push(`${key}: source refresh failed (${reason}).`);
    return fallbackValue;
  }
}

/**
 * Fill every missing parsed series from the previous validated publication.
 * Freshness remains the verifier's responsibility: retained fast-cadence
 * series can keep a transient outage from aborting a run, but cannot pass the
 * existing publication gate after they exceed their allowed age.
 */
export async function retainPreviousSeries({ series, loadPreviousSeries, warnings }) {
  const retainedKeys = [];

  for (const key of Object.keys(series)) {
    if (Array.isArray(series[key]) && series[key].length > 0) continue;

    const previous = await loadPreviousSeries(key);
    if (!Array.isArray(previous) || previous.length === 0) continue;

    series[key] = previous;
    retainedKeys.push(key);
    warnings.push(`${key}: retaining the previous validated series after the current refresh produced no usable data.`);
  }

  return retainedKeys;
}
