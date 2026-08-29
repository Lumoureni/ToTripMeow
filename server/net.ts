import { networkInterfaces } from 'node:os'

/** 列出本机可用于局域网访问的 IPv4 地址 */
export function listLanAddresses(): string[] {
  const addrs: string[] = []
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address)
    }
  }
  return addrs
}
