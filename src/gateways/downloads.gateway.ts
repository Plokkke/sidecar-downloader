import { Logger, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { DownloadEventEmitter, DownloadEventType, DownloadProgressEvent } from '@/services/download-events';

const PROGRESS_THROTTLE_MS = 500;

@WebSocketGateway({ cors: true })
export class DownloadsGateway implements OnModuleInit {
  private readonly logger = new Logger(DownloadsGateway.name);
  private progressThrottleTimer: ReturnType<typeof setInterval> | null = null;
  private pendingProgress = new Map<string, DownloadProgressEvent>();

  @WebSocketServer()
  server!: Server;

  constructor(private readonly events: DownloadEventEmitter) {}

  onModuleInit(): void {
    this.events.on(DownloadEventType.Progress, (payload) => {
      this.pendingProgress.set(payload.id, payload);
    });

    this.events.on(DownloadEventType.Completed, (payload) => {
      this.server.to(DownloadEventType.Completed).emit(DownloadEventType.Completed, payload);
    });

    this.events.on(DownloadEventType.Failed, (payload) => {
      this.server.to(DownloadEventType.Failed).emit(DownloadEventType.Failed, payload);
    });

    this.progressThrottleTimer = setInterval(() => {
      if (this.pendingProgress.size === 0) {
        return;
      }

      for (const [, progress] of this.pendingProgress) {
        this.server.to(DownloadEventType.Progress).emit(DownloadEventType.Progress, progress);
      }
      this.pendingProgress.clear();
    }, PROGRESS_THROTTLE_MS);

    this.logger.log('Downloads WebSocket gateway initialized');
  }

  onModuleDestroy(): void {
    if (this.progressThrottleTimer) {
      clearInterval(this.progressThrottleTimer);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() topics: string[]): void {
    const validTopics = Object.values(DownloadEventType) as string[];
    const accepted = topics.filter((t) => validTopics.includes(t));

    for (const topic of accepted) {
      client.join(topic);
    }

    this.logger.debug(`Client ${client.id} subscribed to: ${accepted.join(', ')}`);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() topics: string[]): void {
    for (const topic of topics) {
      client.leave(topic);
    }

    this.logger.debug(`Client ${client.id} unsubscribed from: ${topics.join(', ')}`);
  }
}
