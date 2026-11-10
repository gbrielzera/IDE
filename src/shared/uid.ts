// Identidade interna dos componentes: um UUID que nunca muda (o `id` é o nome que o código Python usa e pode ser renomeado).

/** Novo identificador interno (UUID v4). */
export function newUid(): string {
  return globalThis.crypto.randomUUID()
}

const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUid(v: unknown): v is string {
  return typeof v === 'string' && UID.test(v)
}
