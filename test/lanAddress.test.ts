import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBindHost } from '../src/lanConfig.ts'
import {
  defaultInterfaceFromProcRoute,
  defaultInterfaceFromRouteGet,
  defaultInterfaceFromWindowsRoute,
  isLinkLocalAddress,
  isPrivateLanAddress,
  selectLanAddress,
  type LanNic,
} from '../src/lanAddress.ts'

const nic = (name: string, address: string, family: LanNic['family'] = 'ipv4', internal = false): LanNic => ({
  name,
  address,
  family,
  internal,
})

test('selectLanAddress prefers the default-route interface and skips loopback and link-local', () => {
  const nics = [
    nic('lo', '127.0.0.1', 'ipv4', true),
    nic('eth0', '169.254.1.1'),
    nic('eth0', 'fe80::1', 'ipv6'),
    nic('eth1', '10.1.1.5'),
    nic('eth0', '192.168.1.20'),
    nic('eth0', 'fd12::5', 'ipv6'),
  ]
  assert.equal(selectLanAddress(nics, 'eth0'), '192.168.1.20')
  assert.equal(selectLanAddress(nics, 'eth1'), '10.1.1.5')
  assert.equal(selectLanAddress(nics, 'missing'), '10.1.1.5')
  assert.equal(
    selectLanAddress(
      [nic('lo', '127.0.0.1', 'ipv4', false), nic('wlan0', '::1', 'ipv6'), nic('wlan0', '169.254.4.4')],
      'wlan0',
    ),
    null,
  )
})

test('selectLanAddress uses an explicit local private address and refuses one that is not local', () => {
  const nics = [nic('eth0', '10.0.0.8'), nic('eth1', '192.168.0.4')]
  assert.equal(selectLanAddress(nics, 'eth0', '192.168.0.4'), '192.168.0.4')
  assert.equal(selectLanAddress(nics, 'eth0', '8.8.8.8'), null)
  assert.equal(selectLanAddress(nics, 'eth0', '10.9.9.9'), null)
  assert.equal(selectLanAddress(nics, 'eth0', '0.0.0.0'), '10.0.0.8')
})

test('private and link-local classification stays off loopback', () => {
  assert.equal(isPrivateLanAddress('10.0.0.1'), true)
  assert.equal(isPrivateLanAddress('172.16.0.1'), true)
  assert.equal(isPrivateLanAddress('172.31.255.255'), true)
  assert.equal(isPrivateLanAddress('172.15.0.1'), false)
  assert.equal(isPrivateLanAddress('172.32.0.1'), false)
  assert.equal(isPrivateLanAddress('192.168.1.1'), true)
  assert.equal(isPrivateLanAddress('8.8.8.8'), false)
  assert.equal(isPrivateLanAddress('127.0.0.1'), false)
  assert.equal(isPrivateLanAddress('::1'), false)
  assert.equal(isPrivateLanAddress('fd00::1'), true)
  assert.equal(isLinkLocalAddress('169.254.1.1'), true)
  assert.equal(isLinkLocalAddress('fe80::1'), true)
  assert.equal(isLinkLocalAddress('192.168.1.1'), false)
})

test('default route parsers', () => {
  const proc = [
    'Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT',
    'eth0 00000000 0101A8C0 0003 0 0 100 00000000 0 0 0',
    'eth1 00000000 0100A8C0 0003 0 0 50 00000000 0 0 0',
    'eth0 0001A8C0 00000000 0001 0 0 0 FFFFFFFF 0 0 0',
  ].join('\n')
  assert.equal(defaultInterfaceFromProcRoute(proc), 'eth1')
  assert.equal(defaultInterfaceFromRouteGet('   interface: en0\n'), 'en0')
  assert.equal(
    defaultInterfaceFromWindowsRoute('0.0.0.0 0.0.0.0 192.168.1.1 192.168.1.23 25', [nic('Wi-Fi', '192.168.1.23')]),
    'Wi-Fi',
  )
})

test('chooseBindHost keeps loopback unless LAN is on, and keeps an explicit share address', () => {
  assert.equal(chooseBindHost(undefined, false), '127.0.0.1')
  assert.equal(chooseBindHost('127.0.0.1', false), '127.0.0.1')
  assert.equal(chooseBindHost(undefined, true), '0.0.0.0')
  assert.equal(chooseBindHost('127.0.0.1', true), '0.0.0.0')
  assert.equal(chooseBindHost('0.0.0.0', false), '0.0.0.0')
  assert.equal(chooseBindHost('10.1.2.3', true), '10.1.2.3')
})
