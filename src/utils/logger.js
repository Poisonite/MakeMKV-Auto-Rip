import chalk from "chalk";
import { format } from "date-fns";

/**
 * Color styling functions using chalk
 */
export const colors = {
  info: chalk.green,
  error: chalk.red,
  time: chalk.yellow,
  dash: chalk.gray,
  title: chalk.cyan,
  line1: chalk.white.bgBlack,
  line2: chalk.black.bgWhite,
  warning: chalk.white.bgRed,
  white: {
    underline: chalk.white.underline,
  },
  blue: chalk.blue,
};

/**
 * Logger utility class for consistent logging throughout the application
 */
export class Logger {
  static info(message, title = null) {
    const timestamp = colors.time(format(new Date(), "h:mm:ss a"));
    const dash = colors.dash(" - ");
    const infoText = colors.info(message);

    if (title) {
      console.info(`${timestamp}${dash}${infoText}${colors.title(title)}`);
    } else {
      console.info(`${timestamp}${dash}${infoText}`);
    }
  }

  static error(message, details = null) {
    const timestamp = colors.time(format(new Date(), "h:mm:ss a"));
    const dash = colors.dash(" - ");
    const errorText = colors.error(message);

    console.error(`${timestamp}${dash}${errorText}`);
    if (details) {
      console.error(colors.blue(details));
    }
  }

  static warning(message) {
    console.info(colors.warning(message));
  }

  static plain(message) {
    console.info(message);
  }

  static separator() {
    console.info("");
  }

  static header(message) {
    console.info(colors.line1(message));
  }

  static headerAlt(message) {
    console.info(colors.line2(message));
  }

  static underline(message) {
    console.info(colors.white.underline(message));
  }
}
