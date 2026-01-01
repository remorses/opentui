import type { ServerWebSocket } from "bun"
import type { ClientMessage, ServerMessage } from "../shared/types"
import { SessionCore, type Session } from "../shared/session-core"

export type { Session }

interface InternalSession {
  core: SessionCore
  ws: ServerWebSocket<{ sessionId: string }>
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>()
  private frameRate: number
  private maxCols: number
  private maxRows: number
  private onConnection: (session: Session) => void | (() => void)

  constructor(options: {
    frameRate?: number
    maxCols?: number
    maxRows?: number
    onConnection: (session: Session) => void | (() => void)
  }) {
    this.frameRate = options.frameRate ?? 50
    this.maxCols = options.maxCols ?? 200
    this.maxRows = options.maxRows ?? 60
    this.onConnection = options.onConnection
  }

  async createSession(ws: ServerWebSocket<{ sessionId: string }>, query: URLSearchParams): Promise<string> {
    const id = crypto.randomUUID()

    // Get initial size from query or use defaults
    const cols = Math.min(parseInt(query.get("cols") || "80"), this.maxCols)
    const rows = Math.min(parseInt(query.get("rows") || "24"), this.maxRows)

    const core = new SessionCore({
      id,
      cols,
      rows,
      maxCols: this.maxCols,
      maxRows: this.maxRows,
      frameRate: this.frameRate,
      send: (message: ServerMessage) => {
        try {
          ws.send(JSON.stringify(message))
        } catch (error) {
          console.error(`Failed to send message to session ${id}:`, error)
        }
      },
      onConnection: this.onConnection,
    })

    const session: InternalSession = { core, ws }
    this.sessions.set(id, session)

    await core.init(() => ws.close())

    return id
  }

  handleMessage(sessionId: string, message: ClientMessage): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.core.handleMessage(message)
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.core.destroy()
    this.sessions.delete(sessionId)
  }

  getSessionCount(): number {
    return this.sessions.size
  }
}
