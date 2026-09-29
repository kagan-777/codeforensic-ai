// Compares two scans of the same project using finding fingerprints.
// A fingerprint = rule + file + the text of the matched line, so findings still
// match when code above them moves (line numbers change).

export interface Fingerprinted {
  fingerprint: string;
}

export interface ScanComparison<T extends Fingerprinted> {
  /** Detected now, not detected in the previous scan. */
  newFindings: T[];
  /** Detected previously, NOT detected by the current analyzer. (Not the same as "fixed" or "secure".) */
  noLongerDetected: T[];
  /** Detected in both scans. */
  stillDetected: T[];
}

export function compareScans<T extends Fingerprinted>(previous: T[], current: T[]): ScanComparison<T> {
  const prev = new Set(previous.map((f) => f.fingerprint));
  const curr = new Set(current.map((f) => f.fingerprint));
  return {
    newFindings: current.filter((f) => !prev.has(f.fingerprint)),
    noLongerDetected: previous.filter((f) => !curr.has(f.fingerprint)),
    stillDetected: current.filter((f) => prev.has(f.fingerprint)),
  };
}
