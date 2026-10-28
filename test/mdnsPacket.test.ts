import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  announcementPacket,
  chooseMdnsBackend,
  decodeMessage,
  goodbyePacket,
  queryPacket,
  responseForQuery,
  type ServiceAnnouncement,
} from '../src/mdnsPacket.ts'

const service: ServiceAnnouncement = {
  port: 9477,
  address: '192.168.1.20',
  product: 'Living Plan',
}

const secret = 'lan-capability-token'

function texts(packet: Buffer): string[] {
  const decoded = decodeMessage(packet)
  return decoded.answers.flatMap((record) => record.texts ?? [])
}

test('the announcement names the service, the port, and a private address', () => {
  const packet = announcementPacket(service)
  const decoded = decodeMessage(packet)
  const ptr = decoded.answers.find((record) => record.type === 'PTR')
  const srv = decoded.answers.find((record) => record.type === 'SRV')
  const txt = decoded.answers.find((record) => record.type === 'TXT')
  const address = decoded.answers.find((record) => record.type === 'A')
  assert.equal(ptr?.name, '_http._tcp.local')
  assert.equal(ptr?.value, 'Living Plan._http._tcp.local')
  assert.equal(ptr?.flush, false)
  assert.equal(srv?.value, '0 0 9477 living-plan.local')
  assert.equal(srv?.flush, true)
  assert.deepEqual(txt?.texts, ['port=9477', 'product=Living Plan'])
  assert.equal(address?.name, 'living-plan.local')
  assert.equal(address?.value, '192.168.1.20')
  const raw = packet.toString('utf8')
  assert.equal(raw.includes(secret), false)
  assert.equal(raw.includes('127.0.0.1'), false)
  assert.equal(raw.includes('lan='), false)
  assert.equal(raw.includes('token'), false)
})

test('a PTR query is answered and an unrelated query is ignored', () => {
  const response = responseForQuery(queryPacket('_http._tcp.local', 'PTR'), service)
  assert.ok(response)
  const decoded = decodeMessage(response as Buffer)
  assert.equal(decoded.answers.some((record) => record.type === 'PTR'), true)
  const all = [...decoded.answers, ...decoded.additional]
  assert.equal(all.some((record) => record.type === 'A' && record.value === '192.168.1.20'), true)
  assert.deepEqual(
    all.find((record) => record.type === 'TXT')?.texts,
    ['port=9477', 'product=Living Plan'],
  )
  assert.equal(responseForQuery(queryPacket('example.com', 'A'), service), null)
  assert.equal(responseForQuery(Buffer.from('not-dns'), service), null)
  assert.equal((response as Buffer).toString('utf8').includes(secret), false)
})

test('goodbye uses TTL 0 and loopback or link-local addresses are refused', () => {
  const goodbye = decodeMessage(goodbyePacket(service))
  assert.ok(goodbye.answers.every((record) => record.ttl === 0))
  assert.throws(() => announcementPacket({ ...service, address: '127.0.0.1' }))
  assert.throws(() => announcementPacket({ ...service, address: '::1' }))
  assert.throws(() => announcementPacket({ ...service, address: '169.254.1.1' }))
  assert.throws(() => announcementPacket({ ...service, address: 'fe80::1' }))
  assert.equal(texts(announcementPacket(service)).some((value) => value.includes(secret)), false)
})

test('mDNS backend follows the system daemon', () => {
  assert.equal(chooseMdnsBackend({ platform: 'darwin', udp5353OwnedBySystem: true, avahiRunning: false }), 'dns-sd')
  assert.equal(chooseMdnsBackend({ platform: 'darwin', udp5353OwnedBySystem: false, avahiRunning: false }), 'process')
  assert.equal(chooseMdnsBackend({ platform: 'linux', udp5353OwnedBySystem: true, avahiRunning: true }), 'avahi')
  assert.equal(chooseMdnsBackend({ platform: 'linux', udp5353OwnedBySystem: true, avahiRunning: false }), 'process')
  assert.equal(chooseMdnsBackend({ platform: 'win32', udp5353OwnedBySystem: false, avahiRunning: false }), 'process')
})
