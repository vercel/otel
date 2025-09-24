export function normalizeId(id: string | Uint8Array): string {
    if (typeof id === 'string') {
      return id
    }
    return Buffer.from(id).toString('hex')
  }