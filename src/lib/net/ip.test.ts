import { describe, expect, it } from "vitest"

import { ipNaoPublico } from "./ip"

describe("ipNaoPublico", () => {
  it("bloqueia loopback, privados, link-local, CGNAT e metadados de nuvem", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(ipNaoPublico(ip), ip).toBe(true)
    }
    for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::"]) {
      expect(ipNaoPublico(ip), ip).toBe(true)
    }
    expect(ipNaoPublico("não é ip")).toBe(true)
  })

  it("libera endereços públicos", () => {
    for (const ip of [
      "200.129.0.1",
      "8.8.8.8",
      "172.32.0.1",
      "2804:14c::1",
      "::ffff:200.129.0.1",
    ]) {
      expect(ipNaoPublico(ip), ip).toBe(false)
    }
  })
})
