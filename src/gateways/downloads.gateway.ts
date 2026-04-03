import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';

import { DownloadEngine } from '@/services/download-engine';
import { DownloadEventEmitter, DownloadEventType, DownloadProgressEvent } from '@/services/download-events';

const PROGRESS_THROTTLE_MS = 500;
const VALID_TOPICS = new Set<string>(Object.values(DownloadEventType));

type WsClient = import('ws').WebSocket;

enum ClientMessageType {
  Subscribe = 'subscribe',
  Unsubscribe = 'unsubscribe',
  Download = 'download',
  Cancel = 'cancel',
  Remove = 'remove',
  Clear = 'clear',
  List = 'list',
}

type ClientMessage =
  | { type: ClientMessageType.Subscribe; topics: string[] }
  | { type: ClientMessageType.Unsubscribe; topics: string[] }
  | { type: ClientMessageType.Download; url: string; metadata?: Record<string, string> }
  | { type: ClientMessageType.Cancel; id: string }
  | { type: ClientMessageType.Remove; id: string }
  | { type: ClientMessageType.Clear }
  | { type: ClientMessageType.List };

@WebSocketGateway()
export class DownloadsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DownloadsGateway.name);
  private readonly subscriptions = new Map<WsClient, Set<string>>();
  private pendingProgress = new Map<string, DownloadProgressEvent>();
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly events: DownloadEventEmitter,
    private readonly engine: DownloadEngine,
  ) {}

  onModuleInit(): void {
    this.server.on('connection', (client: WsClient) => {
      this.subscriptions.set(client, new Set());

      client.on('message', (raw: Buffer | string) => {
        try {
          this.handleMessage(client, JSON.parse(raw.toString()));
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
      if (this.pendingProgress.size === 0) return;
      for (const [, progress] of this.pendingProgress) {
        this.broadcast(DownloadEventType.Progress, progress);
      }
      this.pendingProgress.clear();
    }, PROGRESS_THROTTLE_MS);

    this.logger.log('WebSocket gateway initialized');
  }

  onModuleDestroy(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
  }

  private handleMessage(client: WsClient, msg: ClientMessage): void {
    switch (msg.type) {
      case ClientMessageType.Subscribe:
        return this.handleSubscribe(client, msg.topics);
      case ClientMessageType.Unsubscribe:
        return this.handleUnsubscribe(client, msg.topics);
      case ClientMessageType.Download:
        this.handleDownload(client, msg.url, msg.metadata);
        return;
      case ClientMessageType.Cancel:
        this.engine.cancel(msg.id);
        return;
      case ClientMessageType.Remove:
        this.engine.remove(msg.id);
        return;
      case ClientMessageType.Clear:
        this.engine.clearCompleted();
        return;
      case ClientMessageType.List:
        this.sendTo(client, { event: 'download.list', data: this.engine.list() });
        return;
    }
  }

  private handleSubscribe(client: WsClient, topics: string[]): void {
    const clientTopics = this.subscriptions.get(client);
    if (!clientTopics) return;
    const accepted = topics.filter((t) => VALID_TOPICS.has(t));
    for (const topic of accepted) clientTopics.add(topic);
    this.logger.debug(`Client subscribed to: ${accepted.join(', ')}`);
  }

  private handleUnsubscribe(client: WsClient, topics: string[]): void {
    const clientTopics = this.subscriptions.get(client);
    if (!clientTopics) return;
    for (const topic of topics) clientTopics.delete(topic);
  }

  private async handleDownload(client: WsClient, url: string, metadata?: Record<string, string>): Promise<void> {
    try {
      const result = await this.engine.download({ url, metadata });
      this.sendTo(client, { event: 'download.started', data: result });
    } catch (error) {
      this.sendTo(client, { event: 'error', data: { message: error instanceof Error ? error.message : String(error) } });
    }
  }

  private sendTo(client: WsClient, payload: unknown): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
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
