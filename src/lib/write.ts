// Every action a person can take maps to one Arkiv operation, and the operation is the rule:
//  - an order lives exactly until it lapses in law (expiry = the law's clock)
//  - an emergency order lives 24 hours unless confirmed; confirming it is extending it
//  - nobody can edit an order or a report once filed (readonly)
//  - anyone can keep a report or a record alive, nobody can change it (permissionless extension)
//  - an order and its permanent record are written together or not at all (one batch)
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import type { Hex } from 'viem'
import { APP, BLOCK_SECONDS, SEALED, pub, type Net, type Order, type Report, type Scope, type Source } from './arkiv'
import { account, ensureGas, wallet } from './wallet'
import { basisCode } from './basis'

/** In a drill the law runs fast: one legal day is one real minute. */
export const DRILL_DAY_MS = 60_000
export const DAY_MS = 86_400_000
export const dayMs = (net: Net) => (net === 'drill' ? DRILL_DAY_MS : DAY_MS)

/** How long a report stays up before it must be confirmed again. */
export const REPORT_LIFE = { live: 6 * 3600, drill: 6 * 60 } as const
/** How long the permanent record lives before someone must keep it alive. */
export const RECORD_YEARS = { live: 2, drill: 0 } as const

const sec = (ms: number) => Math.floor(ms / 1000)
/** Arkiv lifetimes are whole blocks (2 s): round a duration in seconds up to the next block. */
const life = (seconds: number) => ExpirationTime.fromBlocks(Math.max(1, Math.ceil(seconds / BLOCK_SECONDS)))

export type ReportInput = { net: Net; state: string; district: string; carrier: string; status: Report['status']; note?: string; seenAt?: number; late?: boolean }

export async function fileReport(r: ReportInput): Promise<{ key: Hex; txHash: Hex }> {
  await ensureGas()
  const seen = sec(r.seenAt ?? Date.now())
  const { entityKey, txHash } = await wallet.createEntity({
    payload: jsonToPayload({ note: (r.note ?? '').slice(0, 140) }),
    contentType: 'application/json',
    attributes: {
      app: APP,
      type: 'report',
      net: r.net,
      state: r.state,
      district: r.district,
      carrier: r.carrier,
      status: r.status,
      seen: u64(BigInt(seen)),
      late: !!r.late,
    },
    expires: life(REPORT_LIFE[r.net]),
    flags: { readonly: true, permissionlessExtension: true },
  })
  return { key: entityKey, txHash }
}

/** "Still down here": pushes the report's expiry a full window from now. Anyone may do it. */
export async function confirmReport(key: Hex, net: Net): Promise<Hex> {
  await ensureGas()
  const { txHash } = await wallet.extendEntity({ entityKey: key, expires: life(REPORT_LIFE[net]) })
  return txHash
}

export type OrderInput = {
  net: Net
  orderId: string
  state: string
  stateName: string
  districts: string[]
  scope: Scope
  issued: number // ms
  starts: number // ms
  ends: number // ms
  emergency: boolean
  basis: string
  authority: string
  reason: string
  renews?: string | null
  seq?: number
  published?: boolean | null
  sources: Source[]
}

function orderAttrs(o: OrderInput, type: 'order' | 'record') {
  return {
    app: APP,
    type,
    net: o.net,
    order_id: o.orderId,
    state: o.state,
    district: (o.districts.length === 1 ? o.districts[0] : 'multiple').slice(0, 100),
    scope: o.scope,
    issued: u64(BigInt(sec(o.issued))),
    starts: u64(BigInt(sec(o.starts))),
    ends: u64(BigInt(sec(o.ends))),
    emergency: o.emergency,
    basis: basisCode(o.basis),
    renews: o.renews ?? '',
    seq: i32(o.seq ?? 1),
  }
}
function orderPayload(o: OrderInput) {
  return jsonToPayload({ authority: o.authority, reason: o.reason, districts: o.districts, sources: o.sources, stateName: o.stateName, published: o.published ?? null, basis: o.basis, endStated: true })
}

/**
 * Files an order and its permanent record in one transaction.
 * The order expires when it lapses (an unconfirmed emergency order: 24 hours after issue).
 * The record is the memory: readonly, and anyone may extend it.
 */
export async function fileOrder(o: OrderInput, opts: { withOrder?: boolean } = {}): Promise<{ orderKey: Hex | null; recordKey: Hex; txHash: Hex }> {
  await ensureGas()
  const day = dayMs(o.net)
  const lapse = o.emergency ? Math.min(o.ends, o.issued + day) : o.ends
  const live = (opts.withOrder ?? true) && lapse > Date.now() + 5_000
  const creates = [] as Parameters<typeof wallet.executeBatch>[0]['creates']
  if (live)
    creates!.push({
      payload: orderPayload(o),
      contentType: 'application/json',
      attributes: orderAttrs(o, 'order'),
      expires: life(Math.max(30, sec(lapse - Date.now()))),
      flags: { readonly: true },
    })
  creates!.push({
    payload: orderPayload(o),
    contentType: 'application/json',
    attributes: orderAttrs(o, 'record'),
    expires: o.net === 'drill' ? ExpirationTime.fromDays(1) : ExpirationTime.fromYears(RECORD_YEARS.live),
    flags: { readonly: true, permissionlessExtension: true },
  })
  const r = await wallet.executeBatch({ creates })
  const recordKey = r.createdEntities[live ? 1 : 0]
  // seal the archive copy: nobody (the filer included) can delete it afterwards; anyone can extend it
  void wallet.changeOwnership({ entityKey: recordKey, newOwner: SEALED }).catch(() => {})
  return { orderKey: live ? r.createdEntities[0] : null, recordKey, txHash: r.txHash }
}

/** The competent authority confirmed an emergency order: it now lives to its stated end. Owner only. */
export async function confirmEmergency(order: Order): Promise<Hex> {
  await ensureGas()
  const { txHash } = await wallet.extendEntity({ entityKey: order.key, expires: life(Math.max(60, order.ends - sec(Date.now()))) })
  return txHash
}

/** Keep a record alive for another year (or a drill day). Anyone may pay; nobody can change it. */
export async function keepAlive(key: Hex, net: Net, expiresAt: bigint): Promise<Hex> {
  await ensureGas()
  const add = BigInt(Math.round((net === 'drill' ? DRILL_DAY_MS : 365 * DAY_MS) / 1000 / BLOCK_SECONDS))
  const head = await pub.getBlockNumber()
  const target = (expiresAt > head ? expiresAt : head) + add
  const { txHash } = await wallet.extendEntity({ entityKey: key, expires: ExpirationTime.atBlock(target) })
  return txHash
}

export const me = account.address
