import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';

import { DownloadEventEmitter, DownloadEventType, DownloadProgressEvent } from '@/services/download-events';

const PROGRESS_THROTTLE_MS = 500;
const VALID_TOPICS = new Set<string>(Object.values(DownloadEventType));

type WsClient = import('ws').WebSocket;

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  topics: string[];
}

@WebSocketGateway()
export class DownloadsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DownloadsGateway.name);
  private readonly subscriptions = new Map<WsClient, Set<string>>();
  private pendingProgress = new Map<string, DownloadProgressEvent>();
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly events: DownloadEventEmitter) {}

  onModuleInit(): void {
    this.server.on('connection', (client: WsClient) => {
      this.subscriptions.set(client, new Set());

      client.on('message', (raw: Buffer | string) => {
        try {
          const msg: ClientMessage = JSON.parse(raw.toString());
          this.handleMessage(client, msg);
        } catch {
          this.logger.warn('Invalid WebSocket message received');
        }
      });

      client.on('close', () => {
        this.subscriptions.delete(client);
      });
    });

    this.events.on(DownloadEventType.Progress, (payload) => {
      this.pendingProgress.set(payload.id, payload);
    });

    this.events.on(DownloadEventType.Completed, (payload) => {
      this.pendingProgress.delete(payload.id);
      this.broadcast(DownloadEventType.Completed, payload);
    });

    this.events.on(DownloadEventType.Failed, (payload) => {
      this.pendingProgress.delete(payload.id);
      this.broadcast(DownloadEventType.Failed, payload);
    });

    this.events.on(DownloadEventType.Removed, (payload) => {
      this.pendingProgress.delete(payload.id);
      this.broadcast(DownloadEventType.Removed, payload);
    });

    this.progressTimer = setInterval(() => {
      if (this.pendingProgress.size === 0) {
        return;
      }
      for (const [, progress] of this.pendingProgress) {
        this.broadcast(DownloadEventType.Progress, progress);
      }
      this.pendingProgress.clear();
    }, PROGRESS_THROTTLE_MS);

    this.logger.log('WebSocket gateway initialized');
  }

  onModuleDestroy(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
  }

  private handleMessage(client: WsClient, msg: ClientMessage): void {
    const topics = this.subscriptions.get(client);
    if (!topics) {
      return;
    }

    const validRequested = (msg.topics ?? []).filter((t) => VALID_TOPICS.has(t));

    if (msg.type === 'subscribe') {
      for (const topic of validRequested) {
        topics.add(topic);
      }
      this.logger.debug(`Client subscribed to: ${validRequested.join(', ')}`);
    } else if (msg.type === 'unsubscribe') {
      for (const topic of validRequested) {
        topics.delete(topic);
      }
      this.logger.debug(`Client unsubscribed from: ${validRequested.join(', ')}`);
    }
  }

  private broadcast(event: string, payload: unknown): void {
    const message = JSON.stringify({ event, data: payload });
    for (const [client, topics] of this.subscriptions) {
      if (topics.has(event) && client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }
}
