import { NextRequest } from 'next/server'

export function getClientIp(request: NextRequest): string {
  const clientIp = request.headers.get('x-client-ip')
  if (clientIp) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clientIp)) {
      return clientIp
    }
    return clientIp
  }
  
  // TODO - Add a encyrption method to the ip address, so moderators, devs, founders, cant see the ip address, only the user
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim())
    
    const ipv4 = ips.find(ip => {
      return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
    })
    
    if (ipv4) {
      return ipv4
    }
    
    if (ips.length > 0) {
      return ips[0]
    }
  }
  
  if (realIp) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(realIp)) {
      return realIp
    }
    return realIp
  }
  
  return 'unknown'
}