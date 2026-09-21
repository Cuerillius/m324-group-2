/**
 * Error types the domain layer is allowed to throw.
 *
 * Keeping these free of any HTTP concept is what lets the service layer be unit
 * tested without a framework. The router is the only place that maps them onto
 * status codes.
 */

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The request was syntactically fine but violates a business rule. */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly details: Record<string, string[]> = {},
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** A uniqueness constraint would be violated, e.g. a duplicate postal code. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

/** The requested resource does not exist. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}
