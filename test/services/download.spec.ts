import * as fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { Readable } from 'stream';

import { Logger } from '@nestjs/common';

import { DownloadInfos, DownloadingItem } from '@/schemas/DownloadItem';
import { DownloadConfig, DownloadService } from '@/services/download';

function inputs(
  kind: 'movie' | 'show',
  size: number | null,
): { infos: DownloadInfos; rStream: Readable; expected: DownloadingItem } {
  const rStream = new PassThrough();
  return {
    infos: {
      size,
      fileName: kind === 'show' ? `test.Show.name.S04E23.txt` : `test.Movie.name.txt`,
    },
    rStream,
    expected: {
      id: expect.any(String),
      status: 'Initializing',
      fileName: kind === 'show' ? `test.Show.name.S04E23.txt` : `test.Movie.name.txt`,
      size,
      downloaded: 0,
      progress: size ? 0 : undefined,
    },
  };
}

function streamData(rStream: Readable, content: string, withError: boolean = false) {
  rStream.push(content);
  if (withError) {
    rStream.emit('error');
  }
  rStream.push(null);
}

function setup(rStream: Readable): {
  wStream: PassThrough;
  writeMock: jest.SpyInstance;
  pipeSpy: jest.SpyInstance;
  onSpy: jest.SpyInstance;
} {
  const wStream = new PassThrough();

  return {
    wStream,
    writeMock: jest.spyOn(fs, 'createWriteStream').mockReturnValue(wStream as unknown as fs.WriteStream),
    pipeSpy: jest.spyOn(rStream, 'pipe'),
    onSpy: jest.spyOn(rStream, 'on'),
  };
}

async function streamFinished(wStream: PassThrough) {
  await new Promise((resolve) => {
    wStream.on('finish', resolve);
  });
}

function verify(
  {
    wStream,
    writeMock,
    pipeSpy,
    onSpy,
  }: {
    wStream: PassThrough;
    writeMock: jest.SpyInstance;
    pipeSpy: jest.SpyInstance;
    onSpy: jest.SpyInstance;
  },
  path: string,
) {
  expect(pipeSpy).toHaveBeenCalledWith(wStream);
  expect(onSpy).toHaveBeenCalledWith('data', expect.any(Function));
  expect(onSpy).toHaveBeenCalledWith('end', expect.any(Function));
  expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));
  expect(writeMock).toHaveBeenCalledWith(path, { flags: 'w' });
}

class TestImpl extends DownloadService {
  protected readonly logger = new Logger('TestImpl');

  constructor(config: DownloadConfig) {
    super('test', config);
  }

  canDownload(): boolean {
    return true;
  }

  async download(): Promise<DownloadingItem> {
    return undefined as unknown as DownloadingItem;
  }

  public save(infos: DownloadInfos, stream: Readable): DownloadingItem {
    return super.save(infos, stream);
  }

  async getMediaInfo(): Promise<DownloadInfos> {
    return {
      fileName: 'test.txt',
      size: 100,
    };
  }
}

const downloadConfig: DownloadConfig = {
  moviesPath: '/tmp/movies',
  showsPath: '/tmp/shows',
};

let service: TestImpl;
beforeEach(() => {
  service = new TestImpl(downloadConfig);
});

describe('Download service test suite', () => {
  describe('list', () => {
    it('should return empty array when no items', () => {
      expect(service.list()).toEqual([]);
    });

    it('should return all items', async () => {
      const content = 'Test content';
      const { infos, rStream } = inputs('movie', content.length);
      const context = setup(rStream);

      const item = service.save(infos, rStream);
      streamData(rStream, content);
      await streamFinished(context.wStream);

      expect(service.list()).toEqual([item]);
    });
  });

  describe('cleanCompleted', () => {
    it('should remove completed items', async () => {
      const content = 'Test content';
      const { infos, rStream } = inputs('movie', content.length);
      const context = setup(rStream);

      service.save(infos, rStream);
      streamData(rStream, content);
      await streamFinished(context.wStream);

      expect(service.list()).toHaveLength(1);
      service.cleanCompleted();
      expect(service.list()).toHaveLength(0);
    });

    it('should keep non-completed items', async () => {
      const content = 'Test content';
      const { infos, rStream } = inputs('movie', content.length);
      const context = setup(rStream);

      service.save(infos, rStream);
      streamData(rStream, content, true); // Simulate error
      await streamFinished(context.wStream);

      expect(service.list()).toHaveLength(1);
      service.cleanCompleted();
      expect(service.list()).toHaveLength(1);
      expect(service.list()[0].status).toBe('Error');
    });
  });

  describe('save', () => {
    it('should stream movie', async () => {
      const content = 'Lorem Ipsum is simply dummy text.';
      const { infos, rStream, expected } = inputs('movie', content.length);
      const context = setup(rStream);

      const item = service.save(infos, rStream);

      expect(item).toMatchObject(expected);
      verify(context, `${downloadConfig.moviesPath}/${infos.fileName}`);

      streamData(rStream, content);
      await streamFinished(context.wStream);
      expect(item).toMatchObject({
        ...expected,
        status: 'Completed',
        downloaded: content.length,
        progress: 1,
      });
    });

    it('should stream show', async () => {
      const content = 'Lorem Ipsum is simply dummy text.';
      const { infos, rStream, expected } = inputs('show', content.length);
      const context = setup(rStream);

      const item = service.save(infos, rStream);

      expect(item).toMatchObject(expected);
      verify(context, `${downloadConfig.showsPath}/test.Show.name/Season04/${infos.fileName}`);

      streamData(rStream, content);
      await streamFinished(context.wStream);
      expect(item).toMatchObject({
        ...expected,
        status: 'Completed',
        downloaded: content.length,
        progress: 1,
      });
    });

    it('should handle error', async () => {
      const content = 'Lorem Ipsum is simply dummy text.';
      const { infos, rStream, expected } = inputs('show', content.length);
      const context = setup(rStream);

      const item = service.save(infos, rStream);

      expect(item).toMatchObject(expected);
      verify(context, `${downloadConfig.showsPath}/test.Show.name/Season04/${infos.fileName}`);

      streamData(rStream, content, true);
      await streamFinished(context.wStream);
      expect(item).toMatchObject({
        ...expected,
        status: 'Error',
        downloaded: content.length,
        progress: 1,
      });
    });

    it('should handle no size', async () => {
      const content = 'Lorem Ipsum is simply dummy text.';
      const { infos, rStream, expected } = inputs('movie', null);
      const context = setup(rStream);

      const item = service.save(infos, rStream);

      expect(item).toMatchObject(expected);
      verify(context, `${downloadConfig.moviesPath}/${infos.fileName}`);

      streamData(rStream, content);
      await streamFinished(context.wStream);
      expect(item).toMatchObject({
        ...expected,
        status: 'Completed',
        downloaded: content.length,
        progress: undefined,
      });
    });

    it('should create directories if they do not exist', async () => {
      const content = 'Test content';
      const { infos, rStream } = inputs('show', content.length);
      setup(rStream);

      const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
      service.save(infos, rStream);

      expect(mkdirSpy).toHaveBeenCalledWith(`${downloadConfig.showsPath}/test.Show.name/Season04`, { recursive: true });
    });
  });
});
