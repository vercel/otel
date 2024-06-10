/** Equivalent to Exception from `@opentelemetry/api`. */
export type Exception =
  | Error
  | ExceptionWithCode
  | ExceptionWithMessage
  | ExceptionWithName
  | string;

interface ExceptionWithCode {
  code: string | number;
  name?: string;
  message?: string;
  stack?: string;
}

interface ExceptionWithMessage {
  code?: string | number;
  message: string;
  name?: string;
  stack?: string;
}

interface ExceptionWithName {
  code?: string | number;
  message?: string;
  name: string;
  stack?: string;
}
