export class VoteError extends Error {
  constructor(message: string, public responseAction: string = "errors") {
    super(message);
  }
}

export class NotFoundError extends VoteError {
  override name: string;
  constructor(message: string) {
    super(message, "ephemeral");
    this.name = "NotFoundError";
  }
}
export class UnauthorizedError extends VoteError {
  override name: string;
  constructor(message: string) {
    super(message, "errors");
    this.name = "UnauthorizedError";
  }
}
export class ValidationError extends VoteError {
  override name: string;
  constructor(message: string) {
    super(message, "errors");
    this.name = "ValidationError";
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceNotFoundError";
  }
}
