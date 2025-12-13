export interface IncomingMessage {
  from: string; // ID do grupo ou número do remetente
  body: string;
  pushName?: string;
  isGroup: boolean;
  messageId?: string;
  participant?: string; // Número do remetente real (em grupos)
  hasImage?: boolean; // Indica se a mensagem contém uma imagem
  imageMessageId?: string; // ID da mensagem de imagem (para download)
  rawMessage?: any; // Mensagem raw do Baileys (para download de mídia)
  mergedMessages?: IncomingMessage[]; // Caso seja um agrupamento de mensagens
}

export interface WhatsAppProvider {
  initialize(): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  onGroupCommand(commandGroupId: string | null, handler: (msg: IncomingMessage) => Promise<void>): void;
  sendText(to: string, text: string): Promise<void>;
  sendImage(to: string, imagePath: string, caption?: string): Promise<void>;
  downloadImage(messageId: string, from: string, rawMessage?: any): Promise<Buffer | null>;
  markAsRead(phone: string, messageId: string): Promise<void>;
  startTyping(phone: string): Promise<void>;
  stopTyping(phone: string): Promise<void>;
  getContactName(phone: string): Promise<string | null>;
}
