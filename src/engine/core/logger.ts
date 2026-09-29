/** Small logger so call sites do not touch `console` directly. */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createConsoleLogger(): Logger {
  return {
    info(message) {
      console.info(`[bairro] ${message}`);
    },
    warn(message) {
      console.warn(`[bairro] ${message}`);
    },
    error(message) {
      console.error(`[bairro] ${message}`);
    },
  };
}
