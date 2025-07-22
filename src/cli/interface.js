import { Logger, colors } from "../utils/logger.js";
import { RipService } from "../services/rip.service.js";
import { APP_INFO, MENU_OPTIONS } from "../constants/index.js";

/**
 * Command-line interface for user interaction
 */
export class CLIInterface {
  constructor() {
    this.ripService = new RipService();
  }

  /**
   * Start the application
   */
  async start() {
    this.displayWelcome();
    await this.promptUser();
  }

  /**
   * Display the welcome message and warnings
   */
  displayWelcome() {
    Logger.header(`${APP_INFO.name} ${APP_INFO.copyright}`);
    Logger.headerAlt("This program comes with ABSOLUTELY NO WARRANTY");
    Logger.header(
      "This is free software, and you are welcome to redistribute it under certain conditions."
    );
    Logger.headerAlt(
      'The full license file can be found in the root folder of this software as "LICENSE.md"'
    );
    Logger.header(
      "Please fully read the README.md file found in the root folder before using this software."
    );
    Logger.separator();
    Logger.separator();
    Logger.header(`---Welcome to ${APP_INFO.name} v${APP_INFO.version}---`);
    Logger.header(`---Developed by ${APP_INFO.author}---`);
    Logger.separator();
    Logger.separator();
    Logger.warning(
      "WARNING--Ensure that you have configured the default.json config file before ripping--WARNING"
    );
    Logger.separator();
  }

  /**
   * Prompt the user for their choice and handle the response
   */
  async promptUser() {
    Logger.underline("Would you like to Auto Rip all inserted discs now?");
    Logger.underline(
      "This includes both internal and USB DVD and Blu-ray drives."
    );
    Logger.separator();
    Logger.plain("Press" + colors.info(" 1 ") + "to Rip.");
    Logger.plain("Press" + colors.error(" 2 ") + "to exit.");

    try {
      const answer = await this.getPromptInput(
        `${colors.info("Rip")} or ${colors.error("Dip")}? `
      );
      await this.handleUserChoice(answer);
    } catch (error) {
      Logger.error("Critical Error, Must Abort!", error);
      process.exit(1);
    }
  }

  /**
   * Get input from the user via stdin
   * @param {string} question - The prompt question
   * @returns {Promise<string>} - User input
   */
  getPromptInput(question) {
    return new Promise((resolve, reject) => {
      const { stdin, stdout } = process;

      stdin.resume();
      stdout.write(question);

      const onData = (data) => {
        stdin.off("data", onData);
        stdin.off("error", onError);
        stdin.pause();
        resolve(data.toString().trim());
      };

      const onError = (err) => {
        stdin.off("data", onData);
        stdin.off("error", onError);
        stdin.pause();
        reject(err);
      };

      stdin.on("data", onData);
      stdin.on("error", onError);
    });
  }

  /**
   * Handle the user's menu choice
   * @param {string} choice - User's choice
   */
  async handleUserChoice(choice) {
    Logger.separator();

    switch (choice) {
      case MENU_OPTIONS.RIP:
        await this.ripService.startRipping();
        // After ripping, prompt again for another round
        await this.promptUser();
        break;

      case MENU_OPTIONS.EXIT:
        Logger.info("Exiting...");
        process.exit(0);
        break;

      default:
        Logger.info("Invalid option selected. Exiting...");
        process.exit(0);
        break;
    }
  }
}
