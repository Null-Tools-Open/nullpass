import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'
import { NextRequest } from 'next/server'

describe('Health endpoint', () => {
  it('should return health status', async () => {
    const request = new NextRequest('http://localhost:3000/api/health', {
      headers: {
        'user-agent': 'test-agent',
      },
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.service).toBe('nullpass')
    expect(data.version).toBe('1.0.0')
  })
})