import { BigInt } from "@graphprotocol/graph-ts"
import { Deposit } from "../generated/AztecRollupProcessor/AztecRollupProcessor"
import { recordDeposit } from "./shared"

const ETH_ASSET_ID = BigInt.zero()

export function handleAztecDeposit(event: Deposit): void {
  if (event.params.assetId.notEqual(ETH_ASSET_ID)) return
  recordDeposit(event.params.depositValue, "aztec", "Aztec Connect", event.block)
}
