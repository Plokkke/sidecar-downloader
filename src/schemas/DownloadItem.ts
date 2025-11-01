import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const downloadItemSchema = z.object({
  url: z.string().url(),
});

const downloadInfoSchema = z.object({
  fileName: z.string(),
  size: z.number().nullable(),
});

const downloadingItemSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['Initializing', 'Completed', 'Downloading', 'Error', 'Extracting']),
  fileName: z.string(),
  size: z.number().nullable(),
  downloaded: z.number(),
  progress: z.number().optional(),
});

export class DownloadItem extends createZodDto(downloadItemSchema) {}
export class DownloadInfos extends createZodDto(downloadInfoSchema) {}
export class DownloadingItem extends createZodDto(downloadingItemSchema) {}
