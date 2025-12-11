export interface IncomingMessage {
  from: string; // ID do grupo ou número do remetente
  body: string;
  pushName?: string;
  isGroup: boolean;
  messageId?: string;
  participant?: string; // Número do remetente real (em grupos)
}

export interface WhatsAppProvider {
  initialize(): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  onGroupCommand(commandGroupId: string | null, handler: (msg: IncomingMessage) => Promise<void>): void;
  sendText(to: string, text: string): Promise<void>;
  markAsRead(phone: string, messageId: string): Promise<void>;
  startTyping(phone: string): Promise<void>;
  stopTyping(phone: string): Promise<void>;
}
