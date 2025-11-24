type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const prefix = '[CRON]';

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  const text = `${prefix} ${level.toUpperCase()} ${message}${payload}`;

  if (level === 'info') console.info(text);
  else if (level === 'warn') console.warn(text);
  else if (level === 'error') console.error(text);
  else console.debug(text);
};

export const cronLogger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
};
