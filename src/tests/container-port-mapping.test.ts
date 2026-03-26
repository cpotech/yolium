/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock dockerode with a class constructor
const mockInspect = vi.fn()
const mockGetContainer = vi.fn(() => ({ inspect: mockInspect }))

class MockDocker {
  getContainer = mockGetContainer
}

vi.mock('dockerode', () => ({ default: MockDocker }))

// Must import after mock is set up — top-level await on dynamic import
const shared = await import('@main/docker/shared')

describe('Docker port mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DEFAULT_EXPOSED_PORTS', () => {
    it('should include ports 3000, 5173, 4200, 8080, 8000 in default exposed set', () => {
      expect(shared.DEFAULT_EXPOSED_PORTS).toEqual([3000, 5173, 4200, 8080, 8000])
    })
  })

  describe('buildPortConfig', () => {
    it('should add ExposedPorts and PortBindings for default dev ports to container create options', () => {
      const config = shared.buildPortConfig()

      for (const port of shared.DEFAULT_EXPOSED_PORTS) {
        expect(config.ExposedPorts).toHaveProperty(`${port}/tcp`)
      }

      for (const port of shared.DEFAULT_EXPOSED_PORTS) {
        expect(config.PortBindings).toHaveProperty(`${port}/tcp`)
        expect(config.PortBindings[`${port}/tcp`]).toEqual([{ HostPort: '0' }])
      }
    })

    it('should map container port 3000 to a dynamic host port', () => {
      const config = shared.buildPortConfig()
      expect(config.PortBindings['3000/tcp']).toEqual([{ HostPort: '0' }])
    })
  })

  describe('queryContainerPorts', () => {
    it('should query Docker API for actual mapped ports of a running container', async () => {
      mockInspect.mockResolvedValue({
        NetworkSettings: {
          Ports: {
            '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '54321' }],
            '5173/tcp': [{ HostIp: '0.0.0.0', HostPort: '54322' }],
          },
        },
      })

      const ports = await shared.queryContainerPorts('test-container-id')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container-id')
      expect(ports).toEqual({ 3000: 54321, 5173: 54322 })
    })

    it('should return empty map when container has no port bindings', async () => {
      mockInspect.mockResolvedValue({
        NetworkSettings: {
          Ports: {},
        },
      })

      const ports = await shared.queryContainerPorts('test-container-id')
      expect(ports).toEqual({})
    })

    it('should handle container not found error gracefully', async () => {
      mockInspect.mockRejectedValue(new Error('No such container'))

      const ports = await shared.queryContainerPorts('nonexistent-id')
      expect(ports).toEqual({})
    })

    it('should handle dynamic host port mapping', async () => {
      mockInspect.mockResolvedValue({
        NetworkSettings: {
          Ports: {
            '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '49152' }],
          },
        },
      })

      const ports = await shared.queryContainerPorts('test-id')
      expect(ports[8080]).toBe(49152)
    })
  })
})
