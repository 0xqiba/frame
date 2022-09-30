import log from 'electron-log'

export interface Request {
  abort: (message: string) => void
  execute: () => Promise<any>,
  type: string
}

const noRequest = {
  type: 'emptyQueue',
  execute: () => Promise.resolve()
}

export class RequestQueue {
  private running = false;
  private requestQueue: Array<Request> = []
  private requestPoller = setTimeout(() => {})

  add (request: Request) {
    this.requestQueue.push(request)
  }

  pollRequest () {
    // each request must return a promise
    const request = (this.requestQueue.length === 0) 
      ? noRequest
      : this.requestQueue.splice(0, 1)[0]

    request.execute()
      .catch(err => log.warn('Ledger request queue caught unexpected error', err))
      .finally(() => {
        if (this.running) {
          this.requestPoller = setTimeout(this.pollRequest.bind(this), 200)
        }
      })
  }

  start () {
    this.running = true
    this.pollRequest()
  }
  
  stop () {
    clearTimeout(this.requestPoller)
    this.running = false
  }

  close (message: string) {
    this.stop()
    this.clear(message)
  }

  clear (message: string) {
    this.requestQueue.forEach((request) => request.abort(message))
    this.requestQueue = []
  }

  peekBack () {
    return this.requestQueue[this.requestQueue.length - 1]
  }
}
