export interface IncomingMessage {
  from: string;
  body: string;
  pushName?: string;
  isGroup: boolean;
  messageId?: string;
}

export interface WhatsAppProvider {
  initialize(): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  sendText(to: string, text: string): Promise<void>;
  markAsRead(phone: string, messageId: string): Promise<void>;
  startTyping(phone: string): Promise<void>;
  stopTyping(phone: string): Promise<void>;
}
