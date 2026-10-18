// The /proof page's checks. Each one asks Arkiv itself, from the visitor's browser (through the relay or
// direct, like every other read), whether a claim the site makes is true right now. The write checks are
// simulations (eth_call): Arkiv runs the transaction and says what it would do, nothing is signed or sent.
import { decodeErrorResult, decodeEventLog, encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, type Hex } from 'viem'
import { ENTITY_EVENTS_ABI } from '@arkiv-network/sdk'
import { and, eq } from '@arkiv-network/sdk/query'
import { APP, SEALED, eventsClient, viaFallback, type Record_ } from './arkiv'
import { REGISTRARS } from './registrars'

const ARKIV: Hex = '0x4400000000000000000000000000000000000044'
// the engine's one entry point and the errors it reverts with (as in @arkiv-network/sdk 0.8.1)
const ABI = parseAbi([
  'function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)',
  'error EntityNotFound(bytes32 entityKey)',
  'error EntityExpired(bytes32 entityKey, uint64 expiresAt)',
  'error NotOwner(bytes32 entityKey, address caller, address owner)',
  'error ReadOnlyEntity(bytes32 entityKey)',
  'error ExpiryNotExtended(bytes32 entityKey, uint64 newExpiresAt, uint64 currentExpiresAt)',
])
const OP = { ExtendExpiry: 3, Delete: 5 } as const
const deleteOp = (entityKey: Hex) => ({ operation: OP.Delete, operationData: encodeAbiParameters(parseAbiParameters('(bytes32 entityKey)'), [{ entityKey }]) })
const extendOp = (entityKey: Hex, expiresAt: bigint) => ({ operation: OP.ExtendExpiry, operationData: encodeAbiParameters(parseAbiParameters('(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)'), [{ entityKey, expiresAt, minLifetime: 0n }]) })

export type Verdict = { ok: boolean; observed: string[]; call: string }
type Sim = { accepted: boolean; error: string; args: string[] }

/** The revert data in a failed eth_call, wherever viem nested it. */
function revertData(e: unknown): Hex | null {
  for (let x = e as { data?: unknown; cause?: unknown; details?: unknown } | undefined, i = 0; x && i < 8; x = x.cause as typeof x, i++) {
    const d = (x.data as { data?: unknown } | undefined)?.data ?? x.data
    if (typeof d === 'string' && /^0x[0-9a-f]{8,}$/i.test(d)) return d as Hex
  }
  return null
}

/** Runs one batch on Arkiv as `from` without signing or sending it (eth_call). An accepted batch returns. */
async function simulate(op: { operation: number; operationData: Hex }, from: Hex): Promise<Sim> {
  const data = encodeFunctionData({ abi: ABI, functionName: 'execute', args: [[op]] })
  try {
    await viaFallback((c) => c.request({ method: 'eth_call', params: [{ from, to: ARKIV, data }, 'latest'] } as never))
    return { accepted: true, error: '', args: [] }
  } catch (e) {
    const raw = revertData(e)
    if (!raw) throw e
    const d = decodeErrorResult({ abi: ABI, data: raw })
    return { accepted: false, error: d.errorName, args: (d.args ?? []).map(String) }
  }
}
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`
const callText = (what: string, from: string, key: Hex) => `eth_call → ${ARKIV}\nexecute([${what}(${short(key)})])\nfrom ${from}`

/** The registrar, who filed the record, asks Arkiv to delete it. Sealed means Arkiv says no. */
export async function tryDelete(r: Record_): Promise<Verdict> {
  const s = await simulate(deleteOp(r.key), r.creator)
  return {
    ok: !s.accepted && s.error === 'NotOwner' && s.args[2]?.toLowerCase() === SEALED.toLowerCase(),
    observed: s.accepted ? ['Arkiv would accept this delete.'] : [`Arkiv refused: ${s.error}`, `caller ${s.args[1] ?? ''}`, `owner ${s.args[2] ?? ''}`],
    call: callText('delete', `${r.creator} (the registrar that filed it)`, r.key),
  }
}

/** Nobody, including us, can bring a record's end forward: lifetimes only grow. */
export async function tryShorten(r: Record_): Promise<Verdict> {
  const target = r.expiresAt - 43_200n
  const s = await simulate(extendOp(r.key, target), r.creator)
  return {
    ok: !s.accepted && s.error === 'ExpiryNotExtended',
    observed: s.accepted ? ['Arkiv would accept a shorter life.'] : [`Arkiv refused: ${s.error}`, `asked for block ${target}, current expiry ${r.expiresAt}`],
    call: callText(`extend to block ${target}, a day earlier,`, r.creator, r.key),
  }
}

/** A stranger, an address that has never touched the register, pays to keep a record a day longer. */
export async function tryStrangerExtend(r: Record_): Promise<Verdict> {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const stranger = `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}` as Hex
  const target = r.expiresAt + 43_200n
  const s = await simulate(extendOp(r.key, target), stranger)
  return {
    ok: s.accepted,
    observed: s.accepted ? ['Arkiv would accept it: the record would live one more day.', `the stranger: ${stranger}`] : [`Arkiv refused: ${s.error}`],
    call: callText(`extend to block ${target}, a day later,`, `${stranger} (a fresh random address)`, r.key),
  }
}

/**
 * The flags every record was created with, as Arkiv reports them, and who owns and filed each one.
 * `records` is the register as shown (each correction in place of the original it replaced);
 * `superseded` are those replaced originals, still on Arkiv, when the page knows them.
 */
export function flagsOf(records: Record_[], superseded?: Record_[]): Verdict {
  const official = records.filter((r) => r.official)
  const n = official.length
  const ro = official.filter((r) => r.readonly).length
  const pe = official.filter((r) => r.permissionless).length
  const sealed = official.filter((r) => r.sealed).length
  const old = (superseded ?? []).filter((r) => r.official)
  const oldOk = old.filter((r) => r.readonly && r.permissionless && r.sealed).length
  return {
    ok: n > 0 && ro === n && pe === n && sealed === n && oldOk === old.length,
    observed: [
      `${n} records on the register, filed by the registrar ($creator ${REGISTRARS[0].address}): every current registrar record; superseded originals are counted separately`,
      `${ro} of ${n} created readonly`,
      `${pe} of ${n} open to anyone's extension`,
      `${sealed} of ${n} owned by ${SEALED}`,
      ...(superseded === undefined
        ? ['superseded originals (replaced by a correction, hidden from the register): not read yet on this page']
        : old.length
          ? [oldOk === old.length ? `${old.length} superseded originals (replaced by a correction, hidden from the register), also readonly, open to extension and sealed` : `${oldOk} of ${old.length} superseded originals readonly, open to extension and sealed`]
          : []),
    ],
    call: `arkiv_query "app = str('${APP}') AND type = str('record') AND net = str('live')" + createdBy(registrar)\nselect: owner, creator, creationFlags`,
  }
}

/** An order that lived 30 blocks: gone from the present, still there at its own block. */
export const EVIDENCE = { key: '0x0bd2969f5a238f263e2846426c6c0cfb2bb9466fd28aae57954a68c30b57302c' as Hex, block: 437_835n, query: "app = str('switched-off') AND order_id = str('drill-evidence-lapse')" }
export async function lapsedButOnRecord(): Promise<Verdict> {
  const ask = (atBlock?: bigint) => viaFallback(async (c) => {
    let q = c.select({ key: true }).where(and([eq('app', APP), eq('order_id', 'drill-evidence-lapse')]))
    if (atBlock) q = q.atBlock(atBlock)
    return (await q.fetch()).entities.length
  })
  const [now, then] = await Promise.all([ask(), ask(EVIDENCE.block)])
  return {
    ok: now === 0 && then === 1,
    observed: [`now: ${now} entities`, `at block ${EVIDENCE.block}: ${then} entity (${short(EVIDENCE.key)})`],
    call: `arkiv_query "${EVIDENCE.query}"\narkiv_query "${EVIDENCE.query}" atBlock ${EVIDENCE.block}`,
  }
}

/** One transaction, many operations: the nine name-free corrections were created and sealed together. */
export const BATCH_TX = '0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e' as Hex
export async function oneTransaction(): Promise<Verdict> {
  const rc = await viaFallback((c) => c.getTransactionReceipt({ hash: BATCH_TX }))
  const kinds: Record<string, number> = {}
  for (const l of rc.logs) {
    if (l.address.toLowerCase() !== ARKIV.toLowerCase()) continue
    try {
      const ev = decodeEventLog({ abi: ENTITY_EVENTS_ABI, data: l.data, topics: (l as unknown as { topics: [Hex, ...Hex[]] }).topics }) as { eventName: string }
      kinds[ev.eventName] = (kinds[ev.eventName] ?? 0) + 1
    } catch {
      /* not an entity event */
    }
  }
  const created = kinds.EntityCreated ?? 0
  const moved = kinds.OwnershipTransferred ?? 0
  return {
    ok: rc.status === 'success' && created > 1 && created === moved,
    observed: [`block ${rc.blockNumber}, status ${rc.status}`, ...Object.entries(kinds).map(([k, v]) => `${v} × ${k}`)],
    call: `eth_getTransactionReceipt ${short(BATCH_TX)}\ndecoded with ENTITY_EVENTS_ABI from @arkiv-network/sdk`,
  }
}

/** Arkiv pushes entity events over its WebSocket: count what arrives in a few seconds, and how much of it is ours. */
export function listen(seconds: number, ours: Set<string>): Promise<Verdict> {
  return new Promise((resolve) => {
    let all = 0
    let mine = 0
    const blocks = new Set<string>()
    let stop: (() => void) | undefined
    const done = (extra: string[] = []) => {
      stop?.()
      resolve({
        ok: all > 0,
        observed: [
          all > 0 ? `Socket live: ${all} entity events from ${blocks.size} blocks in ${seconds} s` : `No entity events in ${seconds} s`,
          mine > 0
            ? `${mine} of them from this register`
            : all > 0
              ? 'none from this register in that window (other apps on Arkiv write constantly; a filing here shows up the same way)'
              : '',
          ...extra,
        ].filter(Boolean),
        call: `eth_subscribe over wss (watchEntityEvents), no filter: Arkiv sends every app's events (friction.md #6)`,
      })
    }
    try {
      stop = eventsClient().watchEntityEvents({
        onEvent: (ev) => {
          all++
          blocks.add(String(ev.blockNumber))
          if (ours.has(String((ev as { entityKey?: string }).entityKey ?? '').toLowerCase())) mine++
        },
        onError: (e) => done([`socket error: ${String((e as Error)?.message ?? e).slice(0, 120)}`]),
      })
    } catch (e) {
      done([`could not open the socket: ${String((e as Error).message).slice(0, 120)}`])
      return
    }
    window.setTimeout(() => done(), seconds * 1000)
  })
}
