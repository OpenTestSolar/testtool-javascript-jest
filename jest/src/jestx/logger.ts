import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';

// 配置 loglevel
log.setLevel(log.levels.DEBUG);

// 配置 loglevel-plugin-prefix
prefix.reg(log);
prefix.apply(log, {
  format(level, name, timestamp) {
    // 获取调用日志的文件名和行号
    const stack = new Error().stack;
    const callerLine = stack ? stack.split('\n')[3] : '';
    const match = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || callerLine.match(/at\s+(.*):(\d+):(\d+)/);
    const callerInfo = match ? `${match[2]}:${match[3]}` : 'unknown';

    return `${timestamp} ${callerInfo} ${level}:`;
  },
  timestampFormatter(date) {
    return date.toISOString();
  }
});

export default log;