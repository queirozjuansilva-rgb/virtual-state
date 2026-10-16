import { isIPv4, isIPv6 } from "node:net"

/**
 * Endereços que um download disparado pelo servidor nunca pode alcançar
 * (proteção contra SSRF): loopback, redes privadas, link-local, CGNAT,
 * multicast e reservados, em IPv4 e IPv6 (inclusive IPv4 mapeado em IPv6).
 */
export function ipNaoPublico(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (isIPv6(ip)) {
    const v = ip.toLowerCase()
    const mapeado = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapeado) return ipNaoPublico(mapeado[1])
    return (
      v === "::" ||
      v === "::1" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      /^fe[89ab]/.test(v) ||
      v.startsWith("ff") ||
      v.startsWith("64:ff9b:") ||
      v.startsWith("2001:db8")
    )
  }
  return true // não é IP válido: trata como não público
}
