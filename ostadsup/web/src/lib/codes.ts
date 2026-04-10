const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomJoinCode(length = 8): string {
  const a = new Uint8Array(length)
  crypto.getRandomValues(a)
  let s = ''
  for (let i = 0; i < length; i++) s += ALPHABET[a[i] % ALPHABET.length]
  return s
}
