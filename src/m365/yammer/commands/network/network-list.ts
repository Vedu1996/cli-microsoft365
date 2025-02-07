import { Logger } from '../../../../cli/Logger.js';
import GlobalOptions from '../../../../GlobalOptions.js';
import request from '../../../../request.js';
import YammerCommand from '../../../base/YammerCommand.js';
import commands from '../../commands.js';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  includeSuspended: boolean;
}

class YammerNetworkListCommand extends YammerCommand {
  public get name(): string {
    return commands.NETWORK_LIST;
  }

  public get description(): string {
    return 'Returns a list of networks to which the current user has access';
  }

  public defaultProperties(): string[] | undefined {
    return ['id', 'name', 'email', 'community', 'permalink', 'web_url'];
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        includeSuspended: args.options.includeSuspended
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '--includeSuspended'
      }
    );
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    const requestOptions: any = {
      url: `${this.resource}/v1/networks/current.json`,
      headers: {
        accept: 'application/json;odata.metadata=none',
        'content-type': 'application/json;odata=nometadata'
      },
      responseType: 'json',
      data: {
        includeSuspended: args.options.includeSuspended !== undefined && args.options.includeSuspended !== false
      }
    };

    try {
      const res: any = await request.get(requestOptions);

      await logger.log(res);
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

export default new YammerNetworkListCommand();