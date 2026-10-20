import { Logger } from '@nestjs/common';

// Unit tests construct services directly (no Nest app, so no silent Pino logger). Without this,
// expected warnings such as "Task failed" would flood the test output and hide real failures.
Logger.overrideLogger(false);
