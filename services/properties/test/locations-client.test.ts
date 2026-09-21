import { describe, expect, it, mock } from 'bun:test';
import {
  createHttpLocationsClient,
  LocationsServiceUnavailableError,
} from '../src/locations-client.js';

const baseUrl = 'http://locations.test';

/**
 * Tests for the client that talks to microservice 1.
 *
 * The `fetch` implementation is injected, so these run offline and finish in
 * milliseconds. They pin down the three outcomes user story 3 has to react to:
 * the locality exists, it does not, or microservice 1 is broken.
 */
describe('httpLocationsClient', () => {
  /**
   * Happy path: a 200 response is parsed into a Location.
   *
   * @expected the locality body, and a request to the documented URL shape.
   */
  it('returns the locality when the service finds one', async () => {
    const location = { id: 'abc', name: 'Niederhasli', postalCode: '8155' };
    const fetchFn = mock().mockResolvedValue(
      new Response(JSON.stringify(location), { status: 200 }),
    );

    const client = createHttpLocationsClient({
      baseUrl,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await client.findById('abc');

    expect(result).toEqual(location);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${baseUrl}/locations/abc`);
  });

  /**
   * Sad path: an unknown locality is a normal business outcome, not a failure.
   *
   * @expected null, so story 3 can turn it into a clear validation message
   *           instead of a 500.
   */
  it('returns null when the locality does not exist', async () => {
    const fetchFn = mock().mockResolvedValue(new Response(null, { status: 404 }));

    const client = createHttpLocationsClient({
      baseUrl,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.findById('missing')).resolves.toBeNull();
  });

  /**
   * Sad path: a network failure must not be mistaken for a missing locality.
   *
   * @expected LocationsServiceUnavailableError, which the router maps to 502.
   */
  it('throws when the locations service is unreachable', async () => {
    const fetchFn = mock().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = createHttpLocationsClient({
      baseUrl,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.findById('abc')).rejects.toBeInstanceOf(LocationsServiceUnavailableError);
  });

  /**
   * Sad path: a 500 from microservice 1 is also an infrastructure failure.
   *
   * @expected LocationsServiceUnavailableError rather than a silent null, so a
   *           property is never stored against an unverified locality.
   */
  it('throws when the locations service returns an error status', async () => {
    const fetchFn = mock().mockResolvedValue(new Response(null, { status: 500 }));

    const client = createHttpLocationsClient({
      baseUrl,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.findById('abc')).rejects.toBeInstanceOf(LocationsServiceUnavailableError);
  });
});
