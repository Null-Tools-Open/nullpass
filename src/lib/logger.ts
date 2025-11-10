const MODE = process.env.MODE || 'dev'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

type LogLevel = 'info' | 'warn' | 'error' | 'ups'

const levels: Record<LogLevel, number> = {
  ups: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = levels[LOG_LEVEL as LogLevel] ?? levels.info
  return levels[level] >= currentLevel || MODE === 'dev'
}

export const logger = {
  ups: (...args: any[]) => {
    if (shouldLog('ups')) {
      console.log('[UPS]', ...args)
    }
  },
  info: (...args: any[]) => {
    if (shouldLog('info')) {
      console.log('[INFO]', ...args)
    }
  },
  warn: (...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn('[WARN]', ...args)
    }
  },
  error: (...args: any[]) => {
    if (shouldLog('error')) {
      console.error('[ERROR]', ...args)
    }
  },
}