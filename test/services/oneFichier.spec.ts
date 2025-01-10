import { PassThrough, Readable } from 'stream';

import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

import { DownloadItem } from '@/schemas/DownloadItem';
import { DownloadConfig, DownloadService } from '@/services/download';
import { OneFichierDownloadService, OneFichierConfig } from '@/services/oneFichier';

describe('OneFichierDownloadService Test Suite', () => {
  let downloadConfig: DownloadConfig;
  let oneFichierConfig: OneFichierConfig;
  let service: OneFichierDownloadService;
  let axiosInstanceMock: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    downloadConfig = {
      moviesPath: '/tmp/movies',
      showsPath: '/tmp/shows',
    };

    oneFichierConfig = {
      host: '1fichier.com',
      apiKey: 'apiKey',
    };

    axiosInstanceMock = {
      post: jest.fn(),
      get: jest.fn(),
      defaults: { headers: {} },
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    } as unknown as jest.Mocked<AxiosInstance>;

    jest.spyOn(axios, 'create').mockReturnValue(axiosInstanceMock);
    jest.spyOn(axios, 'post').mockImplementation(axiosInstanceMock.post);
    jest.spyOn(axios, 'get').mockImplementation(axiosInstanceMock.get);

    service = new OneFichierDownloadService(downloadConfig, oneFichierConfig);
  });

  describe('canDownload', () => {
    it('should return true if URL includes oneFichierConfig.host', () => {
      const url = 'https://1fichier.com/download/file123';
      expect(service.canDownload(url)).toBe(true);
    });

    it('should return false if URL does not include oneFichierConfig.host', () => {
      const url = 'https://otherdomain.com/download/file123';
      expect(service.canDownload(url)).toBe(false);
    });
  });

  describe('download', () => {
    type Setup = {
      downloadItem: DownloadItem;
      readableStream: Readable;
    };

    function setupDownload(
      responseStatus: number = 200,
      responseHeaders: Record<string, string> = {},
      responseData: Readable = new PassThrough(),
    ): Setup {
      const downloadItem: DownloadItem = {
        url: 'https://1fichier.com/download/file123',
      };

      const accessTokenResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
        data: { status: 'OK', url: 'https://download.1fichier.com/file123' },
      };
      axiosInstanceMock.post.mockResolvedValueOnce(accessTokenResponse);

      const downloadResponse: AxiosResponse = {
        status: responseStatus,
        statusText: 'OK',
        headers: responseHeaders,
        config: { headers: {} as any },
        data: responseData,
      };
      axiosInstanceMock.get.mockResolvedValueOnce(downloadResponse);

      return {
        downloadItem,
        readableStream: responseData,
      };
    }

    it('should successfully download a file and update status to Completed', async () => {
      const { downloadItem, readableStream } = setupDownload(200, {
        'content-disposition': 'attachment; filename="test_movie.mp4"',
        'content-length': '707',
      });
      const expectedItem = {
        universalAnswer: 42,
      };

      const mockSave = jest.spyOn(DownloadService.prototype as any, 'save').mockReturnValue(expectedItem);

      const item = await service.download(downloadItem);

      expect(item).toStrictEqual(expectedItem);

      expect(axiosInstanceMock.post).toHaveBeenCalledWith(
        `https://api.${oneFichierConfig.host}/v1/download/get_token.cgi`,
        { url: downloadItem.url },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${oneFichierConfig.apiKey}`,
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(axiosInstanceMock.get).toHaveBeenCalledWith('https://download.1fichier.com/file123', {
        responseType: 'stream',
      });

      expect(mockSave).toHaveBeenCalledWith(
        {
          fileName: 'test_movie.mp4',
          size: 707,
        },
        readableStream,
      );
    });

    it('should throw UnauthorizedException on access token failure', async () => {
      const downloadItem: DownloadItem = {
        url: 'https://1fichier.com/download/file123',
      };

      axiosInstanceMock.post.mockRejectedValueOnce(new Error('Failed to get access token'));

      await expect(service.download(downloadItem)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw InternalServerErrorException on API error', async () => {
      const downloadItem: DownloadItem = {
        url: 'https://1fichier.com/download/file123',
      };

      const accessTokenResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
        data: { status: 'ERROR', message: 'API Error' },
      };
      axiosInstanceMock.post.mockResolvedValueOnce(accessTokenResponse);

      await expect(service.download(downloadItem)).rejects.toThrow(InternalServerErrorException);
    });
  });
});
