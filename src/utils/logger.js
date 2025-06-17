export class Logger {
  constructor(name) {
    this.name = name;
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  info(message, data = {}) {
    if (['info', 'debug'].includes(this.logLevel)) {
      console.log(JSON.stringify({
        level: 'info',
        module: this.name,
        message,
        ...data,
        timestamp: new Date().toISOString()
      }));
    }
  }

  error(message, error, data = {}) {
    console.error(JSON.stringify({
      level: 'error',
      module: this.name,
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...data,
      timestamp: new Date().toISOString()
    }));
  }

  debug(message, data = {}) {
    if (this.logLevel === 'debug') {
      console.log(JSON.stringify({
        level: 'debug',
        module: this.name,
        message,
        ...data,
        timestamp: new Date().toISOString()
      }));
    }
  }
}