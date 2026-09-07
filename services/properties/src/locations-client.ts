import { DomainError } from './errors.js';

/**
 * A locality as microservice 1 returns it. Only the fields this service needs
 * are declared, so a purely additive change over there cannot break us.
 */
export interface Location {
  id: string;
  name: string;
  postalCode: string;
}

/**
 * The contract user story 3 depends on.
 *
 * The course rules forbid reading locality rows out of the database, so this
 * interface is the only way in. Depending on the interface rather than the HTTP
 * implementation is also what makes story 3 unit testable: a test passes a fake
 * that returns whatever locality the case requires.
 */
export interface LocationsClient {
  /** Returns the locality with this id, or null if microservice 1 has none. */
  findById(id: string): Promise<Location | null>;
}

/** Raised when microservice 1 is unreachable or answers with an unexpected status. */
export class LocationsServiceUnavailableError extends DomainError {
  constructor(message: string) {
    super(message, 'LOCATIONS_SERVICE_UNAVAILABLE');
  }
}

export interface HttpLocationsClientOptions {
  baseUrl: string;
  /** Injected so tests can supply a stub instead of hitting the network. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * HTTP implementation backed by microservice 1.
 *
 * A missing locality is a normal outcome and returns null. Anything else is an
 * infrastructure failure and throws, because story 3 must not silently accept a
 * property whose locality could not be verified.
 */
export function createHttpLocationsClient(options: HttpLocationsClientOptions): LocationsClient {
  const { baseUrl, fetchFn = fetch, timeoutMs = 5000 } = options;

  return {
    async findById(id: string): Promise<Location | null> {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/locations/${encodeURIComponent(id)}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        throw new LocationsServiceUnavailableError(
          `Could not reach the locations service: ${String(cause)}`,
        );
      }

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new LocationsServiceUnavailableError(
          `Locations service answered with status ${response.status}`,
        );
      }

      return (await response.json()) as Location;
    },
  };
}
