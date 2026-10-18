// Entities as Arkiv hands them back: tagged attributes ({ type, value }), a JSON payload behind
// toJson(), and the system fields. Tests build hostile and honest ones the same way.
import type { Hex } from 'viem'
import type { Raw } from '../src/lib/arkiv'
import { REGISTRARS } from '../src/lib/registrars'

export const REGISTRAR = REGISTRARS[0].address as Hex
export const ALICE = '0x1111111111111111111111111111111111111111' as Hex
export const MALLORY = '0x2222222222222222222222222222222222222222' as Hex

let n = 0
export const key = (i = ++n) => `0x${i.toString(16).padStart(64, '0')}` as Hex

export const s = (value: string) => ({ type: 'str', value })
export const u = (value: bigint) => ({ type: 'u64', value })

export function raw(over: Partial<Raw> & { payload?: unknown } = {}): Raw {
  const { payload, ...rest } = over
  return {
    key: key(),
    owner: ALICE,
    creator: ALICE,
    createdAt: 1000n,
    expiresAt: 2000n,
    creationFlags: { readonly: true, permissionlessExtension: true },
    attributes: { app: s('switched-off'), type: s('record'), net: s('live'), state: s('MN'), scope: s('mobile-data'), issued: u(1_683_072_000n) },
    toJson: () => payload ?? { authority: 'Home Department, Government of Manipur', districts: ['Imphal West'] },
    ...rest,
  }
}
