export abstract class ArchiveHandler {
  abstract readonly supportedExtensions: string[];
  abstract readonly requiredCommand: string;

  canHandle(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return this.supportedExtensions.some((supported) => ext.endsWith(supported));
  }

  abstract getCommand(archivePath: string, targetDir: string): string;

  async isAvailable(): Promise<boolean> {
    const { exec } = await import('node:child_process');

    return new Promise<boolean>((resolve) => {
      const process = exec(`which ${this.requiredCommand}`);

      process.on('exit', (code) => resolve(code === 0));

      process.on('error', () => resolve(false));
    });
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    const { exec } = await import('node:child_process');

    const command = this.getCommand(archivePath, targetDir);

    return new Promise<void>((resolve, reject) => {
      const process = exec(command);

      process.on('exit', (code) => (code ? reject(new Error(`Extraction failed with exit code ${code}`)) : resolve()));
    });
  }
}
