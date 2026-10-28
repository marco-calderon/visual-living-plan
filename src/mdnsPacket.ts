import { isLinkLocalAddress, isPrivateLanAddress } from './lanAddress'

export const MDNS_INSTANCE = 'Living Plan'
export const MDNS_SERVICE = '_http._tcp'
export const MDNS_HOST = 'living-plan.local'
export const MDNS_PRODUCT = 'Living Plan'

const TYPE_A = 1
const TYPE_PTR = 12
const TYPE_TXT = 16
const TYPE_AAAA = 28
const TYPE_SRV = 33
const TYPE_ANY = 255
const CLASS_IN = 1
const CACHE_FLUSH = 0x8001

const TYPE_NAME: Record<number, DecodedRecord['type']> = {
  [TYPE_A]: 'A',
  [TYPE_PTR]: 'PTR',
  [TYPE_TXT]: 'TXT',
  [TYPE_AAAA]: 'AAAA',
  [TYPE_SRV]: 'SRV',
  [TYPE_ANY]: 'ANY',
}

export type ServiceAnnouncement = {
  instance?: string
  service?: string
  host?: string
  product?: string
  port: number
  address: string
  ttl?: number
}

export type DecodedRecord = {
  name: string
  type: 'A' | 'AAAA' | 'PTR' | 'SRV' | 'TXT' | 'ANY' | 'OTHER'
  ttl: number
  flush: boolean
  value: string
  texts?: string[]
}

export type DecodedMessage = {
  id: number
  response: boolean
  questions: Array<{ name: string; type: string; qu: boolean }>
  answers: DecodedRecord[]
  additional: DecodedRecord[]
}

type NameWriter = {
  bytes: number[]
  write(name: string): void
}

function encodeName(name: string): number[] {
  const out: number[] = []
  const labels = name.replace(/\.$/, '').split('.')
  for (const label of labels) {
    const bytes = Buffer.from(label, 'utf8')
    if (bytes.length === 0 || bytes.length > 63) throw new Error(`DNS label is invalid: ${label}`)
    out.push(bytes.length, ...bytes)
  }
  out.push(0)
  return out
}

function encodeTxt(values: string[]): Buffer {
  const parts = values.map((value) => {
    const bytes = Buffer.from(value, 'utf8')
    if (bytes.length > 255) throw new Error('TXT string is too long')
    return Buffer.concat([Buffer.from([bytes.length]), bytes])
  })
  return Buffer.concat(parts)
}

function ipv4Bytes(address: string): Buffer {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Not an IPv4 address: ${address}`)
  }
  return Buffer.from(parts)
}

function ipv6Bytes(address: string): Buffer {
  const zone = address.split('%')[0] ?? address
  const halves = zone.split('::')
  if (halves.length > 2) throw new Error(`Not an IPv6 address: ${address}`)
  const parse = (side: string): string[] => (side ? side.split(':').filter((part) => part.length > 0) : [])
  const left = parse(halves[0] ?? '')
  const right = halves.length === 2 ? parse(halves[1] ?? '') : []
  const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0
  if (missing < 0) throw new Error(`Not an IPv6 address: ${address}`)
  const groups = halves.length === 2 ? [...left, ...Array.from({ length: missing }, () => '0'), ...right] : left
  if (groups.length !== 8) throw new Error(`Not an IPv6 address: ${address}`)
  const bytes = Buffer.alloc(16)
  groups.forEach((group, index) => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) throw new Error(`Not an IPv6 address: ${address}`)
    bytes.writeUInt16BE(Number.parseInt(group, 16), index * 2)
  })
  return bytes
}

function assertAdvertisable(address: string): void {
  if (!isPrivateLanAddress(address) || isLinkLocalAddress(address)) {
    throw new Error(`Refusing to advertise ${address}`)
  }
}

function instanceName(input: ServiceAnnouncement): string {
  return `${input.instance ?? MDNS_INSTANCE}.${input.service ?? MDNS_SERVICE}.local`
}

function typeName(input: ServiceAnnouncement): string {
  return `${input.service ?? MDNS_SERVICE}.local`
}

function hostName(input: ServiceAnnouncement): string {
  const host = input.host ?? MDNS_HOST
  return host.endsWith('.') ? host.slice(0, -1) : host
}

type RawRecord = {
  name: string
  type: number
  flush: boolean
  ttl: number
  rdata: Buffer
}

function serviceRecords(input: ServiceAnnouncement): RawRecord[] {
  assertAdvertisable(input.address)
  const ttl = input.ttl ?? 120
  const instance = instanceName(input)
  const type = typeName(input)
  const host = hostName(input)
  const port = input.port
  const srv = Buffer.alloc(6)
  srv.writeUInt16BE(0, 0)
  srv.writeUInt16BE(0, 2)
  srv.writeUInt16BE(port, 4)
  const txt = encodeTxt([`port=${port}`, `product=${input.product ?? MDNS_PRODUCT}`])
  const records: RawRecord[] = [
    { name: type, type: TYPE_PTR, flush: false, ttl, rdata: Buffer.from(encodeName(instance)) },
    { name: instance, type: TYPE_SRV, flush: true, ttl, rdata: Buffer.concat([srv, Buffer.from(encodeName(host))]) },
    { name: instance, type: TYPE_TXT, flush: true, ttl, rdata: txt },
  ]
  if (input.address.includes(':')) {
    records.push({ name: host, type: TYPE_AAAA, flush: true, ttl, rdata: ipv6Bytes(input.address) })
  } else {
    records.push({ name: host, type: TYPE_A, flush: true, ttl, rdata: ipv4Bytes(input.address) })
  }
  return records
}

function writeRecord(writer: NameWriter, record: RawRecord): void {
  writer.write(record.name)
  const header = Buffer.alloc(10)
  header.writeUInt16BE(record.type, 0)
  header.writeUInt16BE(record.flush ? CACHE_FLUSH : CLASS_IN, 2)
  header.writeUInt32BE(record.ttl, 4)
  header.writeUInt16BE(record.rdata.length, 8)
  writer.bytes.push(...header, ...record.rdata)
}

function encodeMessage(options: {
  id: number
  response: boolean
  questions: Array<{ name: string; type: number }>
  answers: RawRecord[]
  additional: RawRecord[]
}): Buffer {
  const writer: NameWriter = {
    bytes: [],
    write(name: string) {
      this.bytes.push(...encodeName(name))
    },
  }
  const flags = options.response ? 0x8400 : 0
  const header = Buffer.alloc(12)
  header.writeUInt16BE(options.id, 0)
  header.writeUInt16BE(flags, 2)
  header.writeUInt16BE(options.questions.length, 4)
  header.writeUInt16BE(options.answers.length, 6)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(options.additional.length, 10)
  writer.bytes.push(...header)
  for (const question of options.questions) {
    writer.write(question.name)
    const tail = Buffer.alloc(4)
    tail.writeUInt16BE(question.type, 0)
    tail.writeUInt16BE(CLASS_IN, 2)
    writer.bytes.push(...tail)
  }
  for (const record of options.answers) writeRecord(writer, record)
  for (const record of options.additional) writeRecord(writer, record)
  return Buffer.from(writer.bytes)
}

function readName(packet: Buffer, offset: number, depth = 0): { name: string; offset: number } {
  if (depth > 10) throw new Error('DNS name is too nested')
  const labels: string[] = []
  let cursor = offset
  let jumped = false
  let end = offset
  while (cursor < packet.length) {
    const length = packet[cursor] ?? 0
    if (length === 0) {
      if (!jumped) end = cursor + 1
      return { name: labels.join('.'), offset: end }
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= packet.length) throw new Error('Truncated DNS pointer')
      const pointer = ((length & 0x3f) << 8) | (packet[cursor + 1] ?? 0)
      if (!jumped) end = cursor + 2
      const target = readName(packet, pointer, depth + 1)
      if (target.name) labels.push(target.name)
      return { name: labels.join('.'), offset: end }
    }
    if ((length & 0xc0) !== 0) throw new Error('Bad DNS label')
    const start = cursor + 1
    const stop = start + length
    if (stop > packet.length) throw new Error('Truncated DNS label')
    labels.push(packet.subarray(start, stop).toString('utf8'))
    cursor = stop
    if (!jumped) end = cursor
  }
  throw new Error('Truncated DNS name')
}

function readRecords(packet: Buffer, offset: number, count: number): { records: DecodedRecord[]; offset: number } {
  const records: DecodedRecord[] = []
  let cursor = offset
  for (let index = 0; index < count; index += 1) {
    const name = readName(packet, cursor)
    cursor = name.offset
    if (cursor + 10 > packet.length) throw new Error('Truncated DNS record')
    const type = packet.readUInt16BE(cursor)
    const klass = packet.readUInt16BE(cursor + 2)
    const ttl = packet.readUInt32BE(cursor + 4)
    const length = packet.readUInt16BE(cursor + 8)
    cursor += 10
    const rdata = packet.subarray(cursor, cursor + length)
    if (rdata.length !== length) throw new Error('Truncated DNS rdata')
    cursor += length
    records.push(describeRecord(name.name, type, klass, ttl, rdata))
  }
  return { records, offset: cursor }
}

function formatIpv6(bytes: Buffer): string {
  const groups: string[] = []
  for (let index = 0; index < 16; index += 2) groups.push(bytes.readUInt16BE(index).toString(16))
  return groups.join(':')
}

function decodeTxt(rdata: Buffer): string[] {
  const values: string[] = []
  let cursor = 0
  while (cursor < rdata.length) {
    const length = rdata[cursor] ?? 0
    cursor += 1
    values.push(rdata.subarray(cursor, cursor + length).toString('utf8'))
    cursor += length
  }
  return values
}

function describeRecord(name: string, type: number, klass: number, ttl: number, rdata: Buffer): DecodedRecord {
  const kind = TYPE_NAME[type] ?? 'OTHER'
  let value = ''
  let texts: string[] | undefined
  if (type === TYPE_A && rdata.length === 4) value = [...rdata].join('.')
  else if (type === TYPE_AAAA && rdata.length === 16) value = formatIpv6(rdata)
  else if (type === TYPE_PTR) value = readName(rdata, 0).name
  else if (type === TYPE_SRV && rdata.length >= 6) {
    const port = rdata.readUInt16BE(4)
    const target = readName(rdata, 6).name
    value = `${rdata.readUInt16BE(0)} ${rdata.readUInt16BE(2)} ${port} ${target}`
  } else if (type === TYPE_TXT) {
    texts = decodeTxt(rdata)
    value = texts.join('|')
  } else value = rdata.toString('hex')
  return { name, type: kind, ttl, flush: (klass & CACHE_FLUSH) === CACHE_FLUSH, value, texts }
}

export function decodeMessage(packet: Buffer): DecodedMessage {
  if (packet.length < 12) throw new Error('DNS message is too short')
  const id = packet.readUInt16BE(0)
  const flags = packet.readUInt16BE(2)
  const questions: DecodedMessage['questions'] = []
  let cursor = 12
  const questionCount = packet.readUInt16BE(4)
  for (let index = 0; index < questionCount; index += 1) {
    const name = readName(packet, cursor)
    cursor = name.offset
    if (cursor + 4 > packet.length) throw new Error('Truncated DNS question')
    const type = packet.readUInt16BE(cursor)
    const klass = packet.readUInt16BE(cursor + 2)
    cursor += 4
    questions.push({ name: name.name, type: TYPE_NAME[type] ?? 'OTHER', qu: (klass & 0x8000) !== 0 })
  }
  return decodeSections(packet, id, flags, questions)
}

function decodeSections(
  packet: Buffer,
  id: number,
  flags: number,
  questions: DecodedMessage['questions'],
): DecodedMessage {
  let cursor = 12
  for (let index = 0; index < packet.readUInt16BE(4); index += 1) {
    cursor = readName(packet, cursor).offset + 4
  }
  const answers = readRecords(packet, cursor, packet.readUInt16BE(6))
  const authority = readRecords(packet, answers.offset, packet.readUInt16BE(8))
  const additional = readRecords(packet, authority.offset, packet.readUInt16BE(10))
  return {
    id,
    response: (flags & 0x8000) !== 0,
    questions,
    answers: answers.records,
    additional: additional.records,
  }
}

export function announcementPacket(input: ServiceAnnouncement): Buffer {
  return encodeMessage({
    id: 0,
    response: true,
    questions: [],
    answers: serviceRecords(input),
    additional: [],
  })
}

export function goodbyePacket(input: ServiceAnnouncement): Buffer {
  return announcementPacket({ ...input, ttl: 0 })
}

const QUERY_TYPE: Record<string, number> = {
  A: TYPE_A,
  PTR: TYPE_PTR,
  TXT: TYPE_TXT,
  AAAA: TYPE_AAAA,
  SRV: TYPE_SRV,
  ANY: TYPE_ANY,
}

export function queryPacket(name: string, type: keyof typeof QUERY_TYPE): Buffer {
  const code = QUERY_TYPE[type]
  if (!code) throw new Error(`Unknown query type ${type}`)
  return encodeMessage({
    id: 0,
    response: false,
    questions: [{ name, type: code }],
    answers: [],
    additional: [],
  })
}

function recordKey(record: RawRecord): string {
  return `${record.name.toLowerCase()} ${record.type}`
}

export function responseForQuery(packet: Buffer, service: ServiceAnnouncement): Buffer | null {
  let decoded: DecodedMessage
  try {
    decoded = decodeMessage(packet)
  } catch {
    return null
  }
  if (decoded.response || decoded.questions.length === 0) return null
  const records = serviceRecords(service)
  const answers: RawRecord[] = []
  const seen = new Set<string>()
  const take = (record: RawRecord) => {
    const key = recordKey(record)
    if (seen.has(key)) return
    seen.add(key)
    answers.push(record)
  }
  for (const question of decoded.questions) {
    const qtype = QUERY_TYPE[question.type] ?? 0
    for (const record of records) {
      if (record.name.toLowerCase() !== question.name.toLowerCase()) continue
      if (qtype !== TYPE_ANY && record.type !== qtype) continue
      take(record)
    }
  }
  if (answers.length === 0) return null
  const additional: RawRecord[] = []
  const have = new Set(answers.map(recordKey))
  const add = (record: RawRecord) => {
    const key = recordKey(record)
    if (have.has(key)) return
    have.add(key)
    additional.push(record)
  }
  for (const answer of answers) {
    if (answer.type === TYPE_PTR || answer.type === TYPE_SRV) {
      for (const record of records) {
        if (record.type === TYPE_PTR) continue
        add(record)
      }
    }
  }
  return encodeMessage({
    id: decoded.id,
    response: true,
    questions: decoded.questions.map((question) => ({ name: question.name, type: QUERY_TYPE[question.type] ?? TYPE_A })),
    answers,
    additional,
  })
}

export function chooseMdnsBackend(input: {
  platform: NodeJS.Platform
  udp5353OwnedBySystem: boolean
  avahiRunning: boolean
}): 'dns-sd' | 'avahi' | 'process' {
  if (input.platform === 'darwin' && input.udp5353OwnedBySystem) return 'dns-sd'
  if (input.platform === 'linux' && input.avahiRunning) return 'avahi'
  return 'process'
}
