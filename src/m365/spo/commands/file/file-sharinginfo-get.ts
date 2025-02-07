import { cli } from '../../../../cli/cli.js';
import { Logger } from '../../../../cli/Logger.js';
import GlobalOptions from '../../../../GlobalOptions.js';
import request, { CliRequestOptions } from '../../../../request.js';
import { formatting } from '../../../../utils/formatting.js';
import { urlUtil } from '../../../../utils/urlUtil.js';
import { validation } from '../../../../utils/validation.js';
import SpoCommand from '../../../base/SpoCommand.js';
import commands from '../../commands.js';
import { FileSharingPrincipalType } from './FileSharingPrincipalType.js';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  webUrl: string;
  fileId?: string;
  fileUrl?: string;
}

interface SharingPrincipal {
  isActive: boolean;
  isExternal: boolean;
  name: string;
  principalType: string;
}

interface SharingInformation {
  permissionsInformation: {
    links: {
      linkDetails: {
        Invitations: {
          invitee: SharingPrincipal;
        }[];
      };
    }[];
    principals: {
      principal: SharingPrincipal;
    }[];
  };
}

interface FileSharingInformation {
  IsActive: boolean;
  IsExternal: boolean;
  PrincipalType: string;
  SharedWith: string;
}

class SpoFileSharingInfoGetCommand extends SpoCommand {
  public get name(): string {
    return commands.FILE_SHARINGINFO_GET;
  }

  public get description(): string {
    return 'Generates a sharing information report for the specified file';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
    this.#initValidators();
    this.#initOptionSets();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        fileId: (!(!args.options.fileId)).toString(),
        fileUrl: (!(!args.options.fileUrl)).toString()
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-u, --webUrl <webUrl>'
      },
      {
        option: '-i, --fileId [fileId]'
      },
      {
        option: '--fileUrl [fileUrl]'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        const isValidSharePointUrl: boolean | string = validation.isValidSharePointUrl(args.options.webUrl);
        if (isValidSharePointUrl !== true) {
          return isValidSharePointUrl;
        }

        if (args.options.fileId) {
          if (!validation.isValidGuid(args.options.fileId)) {
            return `${args.options.fileId} is not a valid GUID`;
          }
        }

        return true;
      }
    );
  }

  #initOptionSets(): void {
    this.optionSets.push({ options: ['fileId', 'fileUrl'] });
  }

  protected getExcludedOptionsWithUrls(): string[] | undefined {
    return ['fileUrl'];
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    if (this.verbose) {
      await logger.logToStderr(`Retrieving sharing information report for the file ${args.options.fileId || args.options.fileUrl}`);
    }

    try {
      const fileInformation = await this.getNeededFileInformation(args);
      if (this.verbose) {
        await logger.logToStderr(`Retrieving sharing information report for the file with item Id  ${fileInformation.fileItemId}`);
      }

      const requestOptions: CliRequestOptions = {
        url: `${args.options.webUrl}/_api/web/lists/getbytitle('${formatting.encodeQueryParameter(fileInformation.libraryName)}')/items(${fileInformation.fileItemId})/GetSharingInformation?$select=permissionsInformation&$Expand=permissionsInformation`,
        headers: {
          'accept': 'application/json;odata=nometadata'
        },
        responseType: 'json'
      };
      const res = await request.post<SharingInformation>(requestOptions);

      // typically, we don't do this, but in this case, we need to due to
      // the complexity of the retrieved object and the fact that we can't
      // use the generic way of simplifying the output
      if (!cli.shouldTrimOutput(args.options.output)) {
        await logger.log(res);
      }
      else {
        const fileSharingInfoCollection: FileSharingInformation[] = [];
        res.permissionsInformation.links.forEach(link => {
          link.linkDetails.Invitations.forEach(linkInvite => {
            fileSharingInfoCollection.push({
              SharedWith: linkInvite.invitee.name,
              IsActive: linkInvite.invitee.isActive,
              IsExternal: linkInvite.invitee.isExternal,
              PrincipalType: FileSharingPrincipalType[parseInt(linkInvite.invitee.principalType)]
            });
          });
        });
        res.permissionsInformation.principals.forEach(principal => {
          fileSharingInfoCollection.push({
            SharedWith: principal.principal.name,
            IsActive: principal.principal.isActive,
            IsExternal: principal.principal.isExternal,
            PrincipalType: FileSharingPrincipalType[parseInt(principal.principal.principalType)]
          });
        });

        await logger.log(fileSharingInfoCollection);
      }
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }

  private async getNeededFileInformation(args: CommandArgs): Promise<{ fileItemId: number; libraryName: string; }> {
    let requestUrl: string = '';

    if (args.options.fileId) {
      requestUrl = `${args.options.webUrl}/_api/web/GetFileById('${args.options.fileId}')/?$select=ListItemAllFields/Id,ListItemAllFields/ParentList/Title&$expand=ListItemAllFields/ParentList`;
    }
    else {
      const serverRelPath = urlUtil.getServerRelativePath(args.options.webUrl, args.options.fileUrl!);
      requestUrl = `${args.options.webUrl}/_api/web/GetFileByServerRelativePath(decodedUrl='${formatting.encodeQueryParameter(serverRelPath)}')?$select=ListItemAllFields/Id,ListItemAllFields/ParentList/Title&$expand=ListItemAllFields/ParentList`;
    }

    const requestOptions: CliRequestOptions = {
      url: requestUrl,
      headers: {
        'accept': 'application/json;odata=nometadata'
      },
      responseType: 'json'
    };

    const res = await request.get<{ ListItemAllFields: { Id: string; ParentList: { Title: string }; } }>(requestOptions);
    return {
      fileItemId: parseInt(res.ListItemAllFields.Id),
      libraryName: res.ListItemAllFields.ParentList.Title
    };
  }
}

export default new SpoFileSharingInfoGetCommand();