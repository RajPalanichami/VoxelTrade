export class ProviderError extends Error {
  provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
