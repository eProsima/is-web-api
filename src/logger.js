#!/usr/bin/env node

/* Copyright 2023, Proyectos y Sistemas de Mantenimiento SL (eProsima).
 * All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

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
        console.log(colors.red("[is-web-api][ERROR]"), ...message);
      }
    },
    warn: (...message) => {
      if (loggerLevel <= logLevels.warn)
      {
        console.log(colors.yellow("[is-web-api][WARNING]"), ...message);
      }
    },
    info: (...message) => {
      if (loggerLevel <= logLevels.info)
      {
        console.log(colors.green("[is-web-api][INFO]"), ...message);
      }
    },
    debug: (...message) => {
      if (loggerLevel <= logLevels.debug)
      {
        console.log(colors.blue("[is-web-api][DEBUG]"), ...message);
      }
    }
  };
