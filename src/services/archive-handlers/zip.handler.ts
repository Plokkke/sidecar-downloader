import { ArchiveHandler } from './base.handler';

export class ZipHandler extends ArchiveHandler {
  readonly supportedExtensions = ['.zip', '.cbz'];
  readonly requiredCommand = 'unzip';

  getCommand(archivePath: string, targetDir: string): string {
    return `unzip -o "${archivePath}" -d "${targetDir}"`;
  }
}
