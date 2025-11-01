import { ArchiveHandler } from './base.handler';

export class RarHandler extends ArchiveHandler {
  readonly supportedExtensions = ['.rar', '.cbr'];
  readonly requiredCommand = 'unrar';

  getCommand(archivePath: string, targetDir: string): string {
    // -o+ : overwrite files without prompting
    // x : extract with full path
    return `unrar x -o+ "${archivePath}" "${targetDir}/"`;
  }
}
