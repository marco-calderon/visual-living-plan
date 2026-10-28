export class SpikeError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SpikeError'
    this.status = status
  }
}
