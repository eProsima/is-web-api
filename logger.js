var colors = require('colors');

/**
 * Logger Levels: debug (0), info (1), warn (2) and error (3)
 */
var logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/**
 * The default logger level is info, but it can be changed by setting the environment variable LOG_LEVEL
 */
var log_level = process.env.LOG_LEVEL;
log_level = String(log_level).toLowerCase();
var loggerLevel = logLevels.info;
if (Object.keys(logLevels).includes(log_level))
{
  loggerLevel = logLevels[log_level];
}

/**
 * Logger functions to print to console the corresponding message stylish according to its logging level
 */
module.exports = {
    error: (...message) =>
    {
      if (loggerLevel <= logLevels.error)
      {
        console.log(colors.red("[IS-Web-API][ERROR]"), ...message);
      }
    },
    warn: (...message) => {
      if (loggerLevel <= logLevels.warn)
      {
        console.log(colors.yellow("[IS-Web-API][WARNING]"), ...message);
      }
    },
    info: (...message) => {
      if (loggerLevel <= logLevels.info)
      {
        console.log(colors.green("[IS-Web-API][INFO]"), ...message);
      }
    },
    debug: (...message) => {
      if (loggerLevel <= logLevels.debug)
      {
        console.log(colors.blue("[IS-Web-API][DEBUG]"), ...message);
      }
    }
  };